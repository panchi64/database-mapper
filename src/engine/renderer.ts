/**
 * The frame loop.
 *
 * Full redraw every frame, with each node rasterised once into an offscreen
 * bitmap and blitted thereafter. Dirty-rectangle tracking was considered and
 * rejected: it interacts badly with pan and zoom (every pixel moves) and with
 * edges (which span arbitrary regions), and a full redraw of a few hundred cached
 * bitmaps costs a handful of milliseconds anyway.
 *
 * The loop is demand-driven. `invalidate()` marks the frame dirty and schedules
 * one rAF; if nothing changes, nothing is drawn and the tab stays idle.
 */
import { paintAll } from './painter';
import type { NodeDraw, Scene } from './primitives';
import type { Viewport } from './viewport';

/** Bitmap cache entry for a single node. */
interface CachedBitmap {
  canvas: HTMLCanvasElement;
  key: string;
  /** Device pixels per world unit this bitmap was rasterised at. */
  scale: number;
  w: number;
  h: number;
}

/**
 * Zoom is bucketed before it reaches the bitmap cache, so a continuous pinch
 * doesn't re-rasterise every node on every frame. Bitmaps are drawn at the bucket
 * scale and stretched by at most one bucket's worth, which is imperceptible.
 */
/** Closest two grid dots may be drawn, in screen pixels. */
const MIN_GRID_STEP_PX = 12;

function zoomBucket(zoom: number): number {
  return Math.min(4, Math.max(0.25, Math.pow(2, Math.round(Math.log2(zoom) * 2) / 2)));
}

export interface RendererOptions {
  /** Supplies the scene for the current frame. Called once per painted frame. */
  getScene: () => Scene;
  getViewport: () => Viewport;
  /** Background fill; the canvas is opaque so the grid can be drawn over it. */
  getBackground: () => string;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private frame: number | null = null;
  private dirty = true;
  private disposed = false;

  private bitmaps = new Map<string, CachedBitmap>();

  /** Milliseconds spent in the last paint, for the perf budget check. */
  lastFrameMs = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: RendererOptions
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  /**
   * Resize the backing store for the current CSS size and device pixel ratio.
   *
   * The backing store is in device pixels while everything we draw is in CSS
   * pixels, so the base transform absorbs the ratio and no other code has to
   * think about it.
   */
  resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1): void {
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));

    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;
    this.dpr = dpr;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // A resize invalidates every rasterisation if the ratio changed.
    this.bitmaps.clear();
    this.invalidate();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Mark the frame stale and schedule a paint. Cheap to call repeatedly. */
  invalidate(): void {
    this.dirty = true;
    if (this.frame === null && !this.disposed) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  /** Throw away cached bitmaps. Needed on theme change and after fonts load. */
  clearCache(): void {
    this.bitmaps.clear();
    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.bitmaps.clear();
  }

  private tick = (): void => {
    this.frame = null;
    if (this.disposed || !this.dirty) return;

    this.dirty = false;
    const start = performance.now();
    this.paint();
    this.lastFrameMs = performance.now() - start;
  };

  private paint(): void {
    const { ctx } = this;
    const scene = this.options.getScene();
    const vp = this.options.getViewport();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.options.getBackground();
    ctx.fillRect(0, 0, this.width, this.height);

    if (scene.grid) this.paintGrid(scene, vp);

    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);

    for (const group of scene.groups) this.paintNode(group, vp);
    for (const edge of scene.edges) paintAll(ctx, edge.prims);
    for (const node of scene.nodes) this.paintNode(node, vp);

    // Decorations sit outside the cached bitmap: they change on hover and
    // selection, which must not invalidate the node's rasterisation.
    for (const node of scene.nodes) if (node.decorations) paintAll(ctx, node.decorations);
    for (const group of scene.groups) if (group.decorations) paintAll(ctx, group.decorations);

    paintAll(ctx, scene.overlays);

    ctx.restore();

    this.evictStaleBitmaps(scene);
  }

  /**
   * Grid dots, drawn in screen space.
   *
   * Screen space rather than world space so the dots stay exactly one device
   * pixel and never blur or alias as the zoom changes.
   */
  private paintGrid(scene: Scene, vp: Viewport): void {
    const { ctx } = this;
    let step = scene.grid!.step * vp.zoom;
    if (step <= 0) return;

    // One `fillRect` per dot, so the dot count is the frame cost. At a 6px step
    // a 1080p canvas is ~58,000 of them every frame; doubling the spacing until
    // the dots are readable keeps that bounded (and the coarser lattice is a
    // subset of the same grid, so nothing shifts).
    while (step < MIN_GRID_STEP_PX) step *= 2;

    const offsetX = ((vp.x % step) + step) % step;
    const offsetY = ((vp.y % step) + step) % step;

    ctx.fillStyle = scene.grid!.color;
    for (let x = offsetX; x < this.width; x += step) {
      for (let y = offsetY; y < this.height; y += step) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  private paintNode(node: NodeDraw, vp: Viewport): void {
    const { ctx } = this;
    const scale = zoomBucket(vp.zoom) * this.dpr;

    const bitmap = this.bitmapFor(node, scale);
    if (!bitmap) {
      // Rasterisation unavailable (very large node, or no offscreen context):
      // draw straight through, still correct, just uncached.
      ctx.save();
      ctx.translate(node.rect.x, node.rect.y);
      paintAll(ctx, node.prims);
      ctx.restore();
      return;
    }

    ctx.drawImage(bitmap.canvas, node.rect.x, node.rect.y, bitmap.w, bitmap.h);
  }

  private bitmapFor(node: NodeDraw, scale: number): CachedBitmap | null {
    const existing = this.bitmaps.get(node.id);
    if (existing && existing.key === node.cacheKey && existing.scale === scale) {
      return existing;
    }

    const w = node.rect.w;
    const h = node.rect.h;
    // Guard against an absurd allocation from a corrupt size.
    if (w <= 0 || h <= 0 || w * scale > 8192 || h * scale > 8192) return null;

    const canvas = existing?.canvas ?? document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);

    const bctx = canvas.getContext('2d');
    if (!bctx) return null;

    bctx.setTransform(scale, 0, 0, scale, 0, 0);
    bctx.clearRect(0, 0, w, h);
    paintAll(bctx, node.prims);

    const entry: CachedBitmap = { canvas, key: node.cacheKey, scale, w, h };
    this.bitmaps.set(node.id, entry);
    return entry;
  }

  /** Drop bitmaps for nodes that are no longer in the scene at all. */
  private evictStaleBitmaps(scene: Scene): void {
    if (this.bitmaps.size <= scene.nodes.length + scene.groups.length + 64) return;

    const live = new Set<string>();
    for (const n of scene.nodes) live.add(n.id);
    for (const g of scene.groups) live.add(g.id);

    for (const id of this.bitmaps.keys()) {
      if (!live.has(id)) this.bitmaps.delete(id);
    }
  }
}

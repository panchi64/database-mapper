/**
 * The world <-> screen transform, and the camera moves built on it.
 *
 * `screen = world * zoom + offset`. Everything the engine draws is in world
 * coordinates; only the renderer and hit-tester convert.
 *
 * Deliberately plain data with pure functions rather than a class or a store: the
 * viewport changes on every animation frame while panning, and it must be possible
 * to update it without re-rendering React. `ViewportController` below owns the
 * mutable copy and notifies subscribers; React reads it through a throttled hook.
 */
import { clamp, type Point, type Rect } from './geometry';

export interface Viewport {
  /** Screen-space offset of the world origin. */
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export const IDENTITY: Viewport = { x: 0, y: 0, zoom: 1 };

export function toScreen(world: Point, vp: Viewport): Point {
  return { x: world.x * vp.zoom + vp.x, y: world.y * vp.zoom + vp.y };
}

export function toWorld(screen: Point, vp: Viewport): Point {
  return { x: (screen.x - vp.x) / vp.zoom, y: (screen.y - vp.y) / vp.zoom };
}

/** The world-space rect currently visible in a viewport of `size`. */
export function visibleWorldRect(vp: Viewport, size: Size): Rect {
  const topLeft = toWorld({ x: 0, y: 0 }, vp);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: size.width / vp.zoom,
    h: size.height / vp.zoom,
  };
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/**
 * Zoom about a fixed screen point, so the world position under the cursor stays
 * under the cursor. This is what makes wheel-zoom feel anchored rather than
 * sliding the diagram around.
 */
export function zoomAt(vp: Viewport, screenPoint: Point, factor: number): Viewport {
  const zoom = clampZoom(vp.zoom * factor);
  if (zoom === vp.zoom) return vp;

  const world = toWorld(screenPoint, vp);
  return {
    zoom,
    x: screenPoint.x - world.x * zoom,
    y: screenPoint.y - world.y * zoom,
  };
}

/** Centre `world` in the viewport at a given zoom. Replaces React Flow's setCenter. */
export function centerOn(world: Point, size: Size, zoom: number): Viewport {
  const z = clampZoom(zoom);
  return {
    zoom: z,
    x: size.width / 2 - world.x * z,
    y: size.height / 2 - world.y * z,
  };
}

/**
 * Frame `bounds` with padding. Falls back to the identity transform for an empty
 * diagram rather than dividing by zero.
 */
export function fitView(bounds: Rect, size: Size, padding = 48, maxZoom = 1): Viewport {
  if (bounds.w <= 0 || bounds.h <= 0 || size.width <= 0 || size.height <= 0) {
    return { ...IDENTITY };
  }

  const zoom = clampZoom(
    Math.min(
      (size.width - padding * 2) / bounds.w,
      (size.height - padding * 2) / bounds.h,
      maxZoom
    )
  );

  return centerOn(
    { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
    size,
    zoom
  );
}

export function viewportsEqual(a: Viewport, b: Viewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerpViewport(from: Viewport, to: Viewport, t: number): Viewport {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    // Interpolating zoom logarithmically keeps the apparent speed even; a linear
    // ramp from 0.2 to 2 spends most of its time already zoomed in.
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t),
  };
}

type Listener = (vp: Viewport) => void;

/**
 * Holds the live viewport outside React.
 *
 * Panning updates this 60 times a second. Routing it through component state
 * would re-render the whole tree on every frame; instead the renderer reads it
 * directly and only the few widgets that display it (coordinates, minimap)
 * subscribe.
 */
export class ViewportController {
  private vp: Viewport;
  private listeners = new Set<Listener>();
  private animation: number | null = null;

  constructor(initial: Viewport = IDENTITY) {
    this.vp = { ...initial };
  }

  get(): Viewport {
    return this.vp;
  }

  /** Replace the viewport. Cancels any animation in flight. */
  set(next: Viewport, { animate = false, duration = 350 }: { animate?: boolean; duration?: number } = {}): void {
    this.cancelAnimation();

    if (!animate || duration <= 0) {
      this.commit(next);
      return;
    }

    const from = { ...this.vp };
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      this.commit(lerpViewport(from, next, easeOutCubic(t)));

      if (t < 1) this.animation = requestAnimationFrame(step);
      else this.animation = null;
    };

    this.animation = requestAnimationFrame(step);
  }

  update(fn: (vp: Viewport) => Viewport): void {
    this.cancelAnimation();
    this.commit(fn(this.vp));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cancelAnimation(): void {
    if (this.animation !== null) {
      cancelAnimationFrame(this.animation);
      this.animation = null;
    }
  }

  destroy(): void {
    this.cancelAnimation();
    this.listeners.clear();
  }

  private commit(next: Viewport): void {
    if (viewportsEqual(next, this.vp)) return;
    this.vp = next;
    for (const listener of this.listeners) listener(next);
  }
}

/**
 * The minimap.
 *
 * Its own small canvas drawing simplified rectangles — no text, no rows, no
 * routing. Clicking or dragging inside it moves the camera.
 */
import { useCallback, useEffect, useRef } from 'react';
import { diagramBounds, nodeRect, unionBBox, type Rect } from '@/engine/geometry';
import { presetColor, type Palette } from '@/engine/theme';
import { centerOn, type ViewportController } from '@/engine/viewport';
import { useStore } from '@/store';
import type { DBNode } from '@/types';

const WIDTH = 200;
const HEIGHT = 140;
const PADDING = 8;

interface Props {
  viewport: ViewportController;
  palette: Palette;
  /** Size of the main canvas, needed to draw the viewport indicator. */
  canvasSize: () => { width: number; height: number };
}

function nodeColor(node: DBNode, palette: Palette): string {
  return presetColor(palette, node.data.color, node.type === 'note' ? 'yellow' : 'slate');
}

export function CanvasMinimap({ viewport, palette, canvasSize }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nodes = useStore((s) => s.nodes);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // This redraws on every viewport change, i.e. ~60 times a second while
    // panning. Assigning `width`/`height` reallocates the backing store even
    // when the value is unchanged, so only do it when it actually differs.
    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.round(WIDTH * dpr);
    const backingH = Math.round(HEIGHT * dpr);
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = palette.card;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const vp = viewport.get();
    const size = canvasSize();

    // Frame the diagram *and* the current view, so the indicator stays visible
    // even when the camera is parked far from any node.
    const viewRect: Rect = {
      x: -vp.x / vp.zoom,
      y: -vp.y / vp.zoom,
      w: size.width / vp.zoom,
      h: size.height / vp.zoom,
    };

    const content = nodes.length > 0 ? unionBBox([diagramBounds(nodes), viewRect]) : viewRect;
    if (content.w <= 0 || content.h <= 0) return;

    const scale = Math.min(
      (WIDTH - PADDING * 2) / content.w,
      (HEIGHT - PADDING * 2) / content.h
    );
    const offsetX = PADDING + (WIDTH - PADDING * 2 - content.w * scale) / 2;
    const offsetY = PADDING + (HEIGHT - PADDING * 2 - content.h * scale) / 2;

    const project = (r: Rect): Rect => ({
      x: offsetX + (r.x - content.x) * scale,
      y: offsetY + (r.y - content.y) * scale,
      w: Math.max(1, r.w * scale),
      h: Math.max(1, r.h * scale),
    });

    for (const node of nodes) {
      const r = project(nodeRect(node));
      ctx.fillStyle = nodeColor(node, palette);
      ctx.globalAlpha = node.type === 'group' ? 0.25 : 0.85;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.globalAlpha = 1;

    const v = project(viewRect);
    ctx.strokeStyle = palette.selectionRing;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(v.x, v.y, v.w, v.h);
    ctx.fillStyle = palette.marqueeFill;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    // Remember the projection so pointer events can invert it.
    projection.current = { content, scale, offsetX, offsetY };
  }, [nodes, palette, viewport, canvasSize]);

  const projection = useRef<{ content: Rect; scale: number; offsetX: number; offsetY: number } | null>(
    null
  );

  useEffect(() => {
    draw();
    return viewport.subscribe(draw);
  }, [draw, viewport]);

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = ref.current;
      const p = projection.current;
      if (!canvas || !p) return;

      const box = canvas.getBoundingClientRect();
      const world = {
        x: p.content.x + (clientX - box.left - p.offsetX) / p.scale,
        y: p.content.y + (clientY - box.top - p.offsetY) / p.scale,
      };

      viewport.set(centerOn(world, canvasSize(), viewport.get().zoom));
    },
    [viewport, canvasSize]
  );

  return (
    <canvas
      ref={ref}
      width={WIDTH}
      height={HEIGHT}
      style={{ width: WIDTH, height: HEIGHT }}
      className="absolute bottom-4 right-4 z-10 cursor-pointer rounded-md border border-border bg-card shadow-md"
      aria-label="Diagram minimap"
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) moveTo(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
}

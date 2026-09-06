/**
 * The drawing vocabulary.
 *
 * Painters emit these; the canvas renderer and (later) the SVG exporter both
 * consume them. That indirection is the point — a scene is *data*, so the same
 * frame can be rasterised to a canvas, blitted from a cache, or serialised to
 * vector output without any painter knowing which.
 *
 * Keep this set small. Every primitive added here is one every backend must learn
 * to draw.
 */
import type { Point, Rect } from './geometry';

export interface RectPrim {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius. Applied uniformly, or per-corner as [tl, tr, br, bl]. */
  r?: number | [number, number, number, number];
  fill?: string;
  stroke?: string;
  lw?: number;
}

export interface TextPrim {
  t: 'text';
  x: number;
  y: number;
  s: string;
  font: string;
  fill: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

export interface LinePrim {
  t: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  lw?: number;
  dash?: number[];
}

export interface PathPrim {
  t: 'path';
  pts: Point[];
  stroke?: string;
  fill?: string;
  lw?: number;
  dash?: number[];
  /** Round the corners between segments by this radius. */
  radius?: number;
  closed?: boolean;
}

export interface CirclePrim {
  t: 'circle';
  x: number;
  y: number;
  r: number;
  fill?: string;
  stroke?: string;
  lw?: number;
}

export type Primitive = RectPrim | TextPrim | LinePrim | PathPrim | CirclePrim;

/** How much detail a node is drawn with, chosen from the current zoom. */
export type Lod = 'full' | 'compact';

/**
 * One node's drawing.
 *
 * `prims` are in **local** coordinates, relative to `rect`'s origin, so the whole
 * node can be rasterised once into an offscreen bitmap and then blitted wherever
 * it currently sits. `cacheKey` changes exactly when that bitmap would.
 */
export interface NodeDraw {
  id: string;
  rect: Rect;
  lod: Lod;
  cacheKey: string;
  prims: Primitive[];
  /** Drawn after the cached bitmap, in world space: selection rings, ports. */
  decorations?: Primitive[];
}

/** One edge's drawing, in world coordinates. Edges are not bitmap-cached. */
export interface EdgeDraw {
  id: string;
  prims: Primitive[];
  label?: { text: string; at: Point };
}

export interface GridSpec {
  step: number;
  color: string;
}

export interface Scene {
  /** World rect currently visible, for culling. */
  world: Rect;
  grid: GridSpec | null;
  /** Painted behind everything else. */
  groups: NodeDraw[];
  edges: EdgeDraw[];
  nodes: NodeDraw[];
  /** World-space overlays painted last: marquee, in-flight connection. */
  overlays: Primitive[];
}

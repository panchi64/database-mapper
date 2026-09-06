/**
 * Painting a relationship.
 *
 * The crow's-foot markers are derived from the **route's own end segment** rather
 * than from a side enum. The old DOM edge mapped `Position` to one of four fixed
 * rotations, which was fine for beziers leaving a handle but wrong the moment a
 * path can approach from an arbitrary direction. Taking the direction from the
 * geometry means the marker is always square to the line it terminates.
 */
import { FONTS, type Point } from '../geometry';
import type { EdgeDraw, Primitive } from '../primitives';
import { presetColor, type Palette } from '../theme';
import type { Cardinality, DBEdge } from '@/types';

export interface EdgeDrawContext {
  palette: Palette;
  selected: boolean;
  /** Dimmed when something else is hovered and this edge isn't part of it. */
  dimmed?: boolean;
  hovered?: boolean;
}

const MARKER_LEN = 9;
const MARKER_SPREAD = 5;
const CORNER_RADIUS = 6;

function dashFor(pattern: DBEdge['data']['pattern']): number[] | undefined {
  switch (pattern) {
    case 'dashed':
      return [6, 4];
    case 'dotted':
      return [1.5, 3.5];
    case 'dash-dot':
      return [8, 4, 2, 4];
    default:
      return undefined;
  }
}

/** 'one' draws a single crossbar, 'many' draws the three-pronged foot. */
type Foot = 'one' | 'many';

export function sourceFoot(cardinality: Cardinality | undefined): Foot {
  // one-to-* means exactly one on the source side.
  return cardinality === 'many-to-many' ? 'many' : 'one';
}

export function targetFoot(cardinality: Cardinality | undefined): Foot {
  return cardinality === 'one-to-one' ? 'one' : 'many';
}

function normalize(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Marker geometry at `tip`, opening back along `dir` (the unit vector pointing
 * *into* the node).
 */
function footPrims(tip: Point, dir: Point, foot: Foot, stroke: string, lw: number): Primitive[] {
  // Perpendicular to the approach direction.
  const px = -dir.y;
  const py = dir.x;

  // Back off the tip so the marker sits just outside the node border.
  const base = { x: tip.x - dir.x * 2, y: tip.y - dir.y * 2 };

  if (foot === 'one') {
    const bar = { x: base.x - dir.x * MARKER_LEN, y: base.y - dir.y * MARKER_LEN };
    return [
      {
        t: 'line',
        x1: bar.x + px * MARKER_SPREAD,
        y1: bar.y + py * MARKER_SPREAD,
        x2: bar.x - px * MARKER_SPREAD,
        y2: bar.y - py * MARKER_SPREAD,
        stroke,
        lw,
      },
    ];
  }

  // Crow's foot: two splayed lines from the tip back to the spread points.
  const backX = base.x - dir.x * MARKER_LEN;
  const backY = base.y - dir.y * MARKER_LEN;

  return [
    {
      t: 'line',
      x1: base.x,
      y1: base.y,
      x2: backX + px * MARKER_SPREAD,
      y2: backY + py * MARKER_SPREAD,
      stroke,
      lw,
    },
    {
      t: 'line',
      x1: base.x,
      y1: base.y,
      x2: backX - px * MARKER_SPREAD,
      y2: backY - py * MARKER_SPREAD,
      stroke,
      lw,
    },
  ];
}

/**
 * Where to park a label.
 *
 * The midpoint of the **longest straight segment**, not the midpoint of the whole
 * path. An arc-length midpoint frequently lands on a corner, where the chip sits
 * across the bend and reads as floating loose rather than as belonging to a line.
 * The longest run is also the most open space on the path, so the chip is least
 * likely to collide with a neighbouring edge.
 */
function labelAnchor(route: Point[]): Point {
  if (route.length === 0) return { x: 0, y: 0 };
  if (route.length === 1) return route[0];

  let best = 0;
  let bestLength = -1;

  for (let i = 1; i < route.length; i++) {
    const length = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
    if (length > bestLength) {
      bestLength = length;
      best = i;
    }
  }

  return {
    x: (route[best - 1].x + route[best].x) / 2,
    y: (route[best - 1].y + route[best].y) / 2,
  };
}

export function edgeColor(edge: DBEdge, ctx: EdgeDrawContext): string {
  if (ctx.selected) return ctx.palette.edgeSelected;
  if (ctx.dimmed) return ctx.palette.edgeDimmed;
  if (edge.data.color) return presetColor(ctx.palette, edge.data.color);
  return ctx.palette.edge;
}

export function drawEdge(edge: DBEdge, route: Point[], ctx: EdgeDrawContext): EdgeDraw {
  const prims: Primitive[] = [];

  if (route.length < 2) return { id: edge.id, prims };

  const isNoteLink = edge.data.isNoteLink === true;
  const stroke = edgeColor(edge, ctx);
  const lw = ctx.selected ? 2.5 : ctx.hovered ? 2 : isNoteLink ? 1.5 : 1.75;

  prims.push({
    t: 'path',
    pts: route,
    stroke,
    lw,
    dash: dashFor(edge.data.pattern),
    radius: CORNER_RADIUS,
  });

  // Note links are annotations, not relationships: no cardinality to express.
  if (!isNoteLink) {
    const start = route[0];
    const afterStart = route[1];
    const end = route[route.length - 1];
    const beforeEnd = route[route.length - 2];

    // Direction pointing into each node, taken from the terminating segment.
    const sourceDir = normalize(start.x - afterStart.x, start.y - afterStart.y);
    const targetDir = normalize(end.x - beforeEnd.x, end.y - beforeEnd.y);

    prims.push(...footPrims(start, sourceDir, sourceFoot(edge.data.cardinality), stroke, lw));
    prims.push(...footPrims(end, targetDir, targetFoot(edge.data.cardinality), stroke, lw));
  }

  const label = edge.data.label;
  return {
    id: edge.id,
    prims,
    ...(label ? { label: { text: label, at: labelAnchor(route) } } : {}),
  };
}

/**
 * Label chip, drawn in world space over the path.
 *
 * Outlined in the edge's own colour rather than a neutral border: with several
 * labelled relationships on screen, the tie between a chip and its line is the
 * whole point, and colour carries that at a glance where proximity does not.
 */
export function edgeLabelPrims(
  text: string,
  at: Point,
  palette: Palette,
  measure: (s: string, font: string) => number,
  stroke: string = palette.border
): Primitive[] {
  const padX = 7;
  const h = 18;
  const w = measure(text, FONTS.edgeLabel) + padX * 2;

  return [
    {
      t: 'rect',
      x: at.x - w / 2,
      y: at.y - h / 2,
      w,
      h,
      r: 4,
      // Opaque, so the line does not run through the text behind it.
      fill: palette.card,
      stroke,
      lw: 1.25,
    },
    {
      t: 'text',
      x: at.x,
      y: at.y,
      s: text,
      font: FONTS.edgeLabel,
      fill: palette.foreground,
      align: 'center',
      baseline: 'middle',
    },
  ];
}

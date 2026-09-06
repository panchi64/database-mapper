/**
 * What a route has to go around.
 *
 * Every table and note is an obstacle, **including the two the edge connects**.
 * That is the fix for a line reaching a column by passing behind its own table:
 * with the target treated as solid, the only way in is from outside, so the path
 * has to come round to the side the port is on.
 *
 * Groups are *not* obstacles. They are regions drawn behind everything, and
 * treating them as solid would make it impossible to route between two tables
 * inside the same group.
 */
import { rectsIntersect, type Point, type Rect } from '../geometry';
import type { DBNode } from '@/types';

/** How far routes stay clear of a node. Must be less than `STUB`. */
export const PAD = 14;

export interface Obstacle {
  id: string;
  /** The node's rect, inflated by PAD. */
  rect: Rect;
}

export function obstaclesFor(nodes: readonly DBNode[]): Obstacle[] {
  const out: Obstacle[] = [];

  for (const node of nodes) {
    if (node.type === 'group') continue;
    out.push({
      id: node.id,
      rect: {
        x: node.x - PAD,
        y: node.y - PAD,
        w: node.w + PAD * 2,
        h: node.h + PAD * 2,
      },
    });
  }

  return out;
}

/**
 * Does an axis-aligned segment pass through the inside of `rect`?
 *
 * Strict on the perpendicular axis so a segment running exactly along the
 * inflated boundary is allowed — routes are *meant* to hug the padding, and
 * forbidding that would push every path a further cell out.
 */
export function segmentBlocked(a: Point, b: Point, rect: Rect): boolean {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;

  if (a.y === b.y) {
    if (a.y <= rect.y || a.y >= bottom) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi > rect.x && lo < right;
  }

  if (a.x === b.x) {
    if (a.x <= rect.x || a.x >= right) return false;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi > rect.y && lo < bottom;
  }

  // Diagonals never occur in an orthogonal route.
  return false;
}

const CELL = 256;

/**
 * Uniform grid index over the obstacles.
 *
 * This is the one place in the engine a spatial index earns its keep: a single
 * reroute tests thousands of candidate segments, and a linear scan over every
 * table for each would dominate the search. (Hit-testing, by contrast, runs once
 * per pointer event and is fine linear.)
 */
export class ObstacleIndex {
  private cells = new Map<string, Obstacle[]>();

  constructor(readonly obstacles: readonly Obstacle[]) {
    for (const obstacle of obstacles) {
      for (const key of this.keysFor(obstacle.rect)) {
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(obstacle);
        else this.cells.set(key, [obstacle]);
      }
    }
  }

  private *keysFor(rect: Rect): Generator<string> {
    const x0 = Math.floor(rect.x / CELL);
    const y0 = Math.floor(rect.y / CELL);
    const x1 = Math.floor((rect.x + rect.w) / CELL);
    const y1 = Math.floor((rect.y + rect.h) / CELL);

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) yield `${x},${y}`;
    }
  }

  /** Obstacles whose inflated rect overlaps `rect`. */
  query(rect: Rect): Obstacle[] {
    const seen = new Set<Obstacle>();

    for (const key of this.keysFor(rect)) {
      for (const obstacle of this.cells.get(key) ?? []) {
        if (rectsIntersect(obstacle.rect, rect)) seen.add(obstacle);
      }
    }

    return [...seen];
  }

  /** True when the segment passes through any obstacle. */
  blocked(a: Point, b: Point): boolean {
    const rect: Rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x) || 1,
      h: Math.abs(b.y - a.y) || 1,
    };

    for (const obstacle of this.query(rect)) {
      if (segmentBlocked(a, b, obstacle.rect)) return true;
    }

    return false;
  }
}

/**
 * The obstacles worth considering for one route, nearest first.
 *
 * Capped, because A* cost is driven by the candidate grid and the grid is driven
 * by how many obstacle edges fall inside the search box. A pathological diagram
 * with hundreds of tables between two endpoints would otherwise build a grid too
 * large to search inside a frame.
 */
export function relevantObstacles(
  index: ObstacleIndex,
  box: Rect,
  limit = 40
): Obstacle[] {
  const found = index.query(box);
  if (found.length <= limit) return found;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  return found
    .map((o) => ({
      o,
      d: Math.hypot(o.rect.x + o.rect.w / 2 - cx, o.rect.y + o.rect.h / 2 - cy),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((entry) => entry.o);
}

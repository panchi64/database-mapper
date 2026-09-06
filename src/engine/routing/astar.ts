/**
 * Orthogonal path search over a Hanan grid.
 *
 * A Hanan grid is the lattice formed by projecting every obstacle edge (and the
 * endpoints) onto both axes. Any shortest rectilinear path avoiding those
 * obstacles can be drawn on that lattice, so searching it finds the same answer
 * as a continuous search while looking at a few thousand nodes instead of a
 * continuum.
 *
 * The grid is built per route and clipped to the endpoints' neighbourhood — a
 * global lattice over 300 tables would be ~1200x1200, which is far too large to
 * search inside a frame.
 */
import type { Point, Rect } from '../geometry';
import { ObstacleIndex, relevantObstacles, type Obstacle } from './obstacles';

export interface SearchOptions {
  /** Cost of changing direction. Higher means fewer, longer runs. */
  turnPenalty: number;
  /** Give up after this many expansions and let the caller fall back. */
  maxExpansions: number;
  /** How far outside the endpoints' bounding box to consider routing. */
  slack: number;
}

export const DEFAULT_SEARCH: SearchOptions = {
  turnPenalty: 30,
  maxExpansions: 6000,
  slack: 220,
};

/** Sorted, de-duplicated coordinate list. */
function axis(values: number[], lo: number, hi: number): number[] {
  const inside = values.filter((v) => v >= lo && v <= hi);
  return [...new Set(inside)].sort((a, b) => a - b);
}

export interface HananGrid {
  xs: number[];
  ys: number[];
}

/**
 * Candidate lines for one route: every obstacle edge in range, plus the
 * endpoints themselves so the search can actually start and finish on the grid.
 */
export function buildGrid(
  start: Point,
  goal: Point,
  obstacles: readonly Obstacle[],
  box: Rect
): HananGrid {
  const xs = [start.x, goal.x];
  const ys = [start.y, goal.y];

  for (const { rect } of obstacles) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }

  return {
    xs: axis(xs, box.x, box.x + box.w),
    ys: axis(ys, box.y, box.y + box.h),
  };
}

/** Minimal binary heap; the open set is the only hot structure here. */
class Heap {
  private items: { key: number; cost: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, cost: number): void {
    this.items.push({ key, cost });
    let i = this.items.length - 1;

    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= this.items[i].cost) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): number | undefined {
    const top = this.items[0];
    if (!top) return undefined;

    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;

      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l].cost < this.items[smallest].cost) smallest = l;
        if (r < this.items.length && this.items[r].cost < this.items[smallest].cost) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }

    return top.key;
  }
}

// Direction encoding, kept in the state key so turns can be costed.
const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

export interface SearchResult {
  path: Point[];
  expansions: number;
}

/**
 * Find an orthogonal path from `start` to `goal`.
 *
 * Returns null when the goal is unreachable within the budget — the caller falls
 * back to the cheap elbow rather than leaving the edge undrawn.
 *
 * State is (x index, y index, incoming direction). Direction is part of the state
 * so a turn can be charged: without it, A* returns a staircase of a hundred tiny
 * steps that is technically shortest and completely unreadable.
 */
export function findPath(
  start: Point,
  goal: Point,
  index: ObstacleIndex,
  options: SearchOptions = DEFAULT_SEARCH
): SearchResult | null {
  const box: Rect = {
    x: Math.min(start.x, goal.x) - options.slack,
    y: Math.min(start.y, goal.y) - options.slack,
    w: Math.abs(goal.x - start.x) + options.slack * 2,
    h: Math.abs(goal.y - start.y) + options.slack * 2,
  };

  const obstacles = relevantObstacles(index, box);
  const local = new ObstacleIndex(obstacles);
  const grid = buildGrid(start, goal, obstacles, box);

  const cols = grid.xs.length;
  const rows = grid.ys.length;
  if (cols === 0 || rows === 0) return null;

  const xi = grid.xs.indexOf(start.x);
  const yi = grid.ys.indexOf(start.y);
  const gx = grid.xs.indexOf(goal.x);
  const gy = grid.ys.indexOf(goal.y);
  if (xi < 0 || yi < 0 || gx < 0 || gy < 0) return null;

  const cellCount = cols * rows;
  const stateCount = cellCount * 4;

  const gScore = new Float64Array(stateCount).fill(Infinity);
  const cameFrom = new Int32Array(stateCount).fill(-1);
  const closed = new Uint8Array(stateCount);

  const heuristic = (x: number, y: number) =>
    Math.abs(grid.xs[x] - goal.x) + Math.abs(grid.ys[y] - goal.y);

  const open = new Heap();

  // Seed all four directions at the start; the first move is unconstrained.
  for (let d = 0; d < 4; d++) {
    const key = (yi * cols + xi) * 4 + d;
    gScore[key] = 0;
    open.push(key, heuristic(xi, yi));
  }

  let expansions = 0;
  let goalKey = -1;

  while (open.size > 0) {
    const key = open.pop()!;
    if (closed[key]) continue;
    closed[key] = 1;

    if (++expansions > options.maxExpansions) return null;

    const cell = key >> 2;
    const dir = key & 3;
    const x = cell % cols;
    const y = (cell - x) / cols;

    if (x === gx && y === gy) {
      goalKey = key;
      break;
    }

    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd].dx;
      const ny = y + DIRS[nd].dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;

      const from = { x: grid.xs[x], y: grid.ys[y] };
      const to = { x: grid.xs[nx], y: grid.ys[ny] };
      if (local.blocked(from, to)) continue;

      const step = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      const turn = nd === dir ? 0 : options.turnPenalty;
      const tentative = gScore[key] + step + turn;

      const nextKey = (ny * cols + nx) * 4 + nd;
      if (tentative >= gScore[nextKey]) continue;

      gScore[nextKey] = tentative;
      cameFrom[nextKey] = key;
      open.push(nextKey, tentative + heuristic(nx, ny));
    }
  }

  if (goalKey < 0) return null;

  const path: Point[] = [];
  for (let key = goalKey; key !== -1; key = cameFrom[key]) {
    const cell = key >> 2;
    const x = cell % cols;
    const y = (cell - x) / cols;
    path.push({ x: grid.xs[x], y: grid.ys[y] });
  }

  path.reverse();
  return { path, expansions };
}

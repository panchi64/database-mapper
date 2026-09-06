import { describe, expect, it } from 'vitest';
import { METRICS } from './geometry';
import { insertionIndex, resizedRect, snapDelta } from './interactions';
import type { Point } from './geometry';

describe('snapDelta', () => {
  const grid = METRICS.gridSnap;
  const onGrid = { x: 4 * grid, y: 2 * grid };

  it('produces no offset before the pointer has moved', () => {
    expect(snapDelta(onGrid, { x: 0, y: 0 }, false)).toEqual({ x: 0, y: 0 });
  });

  it('holds position until the pointer passes half a cell', () => {
    expect(snapDelta(onGrid, { x: grid * 0.4, y: 0 }, false)).toEqual({ x: 0, y: 0 });
  });

  it('steps a whole cell once past the midpoint', () => {
    expect(snapDelta(onGrid, { x: grid * 0.6, y: 0 }, false)).toEqual({ x: grid, y: 0 });
  });

  /**
   * The regression this function exists for.
   *
   * The delta used to be measured against the node's *current* position, which
   * already had the previous snap applied. Feeding the output back into the input
   * made the node oscillate between two cells while the pointer barely moved.
   *
   * Re-applying the result to the anchor must be a fixed point.
   */
  it('is stable when its own result is fed back in', () => {
    const raw = { x: grid * 0.6, y: grid * 0.7 };
    const first = snapDelta(onGrid, raw, false);

    const moved = { x: onGrid.x + first.x, y: onGrid.y + first.y };
    const second = snapDelta(moved, { x: 0, y: 0 }, false);

    expect(second).toEqual({ x: 0, y: 0 });
  });

  it('does not drift as the pointer moves smoothly across a cell', () => {
    const seen = new Set<number>();
    for (let px = 0; px <= grid; px += 1) {
      seen.add(snapDelta(onGrid, { x: px, y: 0 }, false).x);
    }

    // A whole cell of travel may only ever produce two resting positions.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, grid]);
  });

  it('pulls an off-grid node onto the grid', () => {
    const offGrid = { x: 7, y: 11 };
    const delta = snapDelta(offGrid, { x: 0, y: 0 }, false);

    expect((offGrid.x + delta.x) % grid).toBe(0);
    expect((offGrid.y + delta.y) % grid).toBe(0);
  });

  it('passes the raw delta through when dragging freeform', () => {
    const raw = { x: 3.5, y: -2.25 };
    expect(snapDelta(onGrid, raw, true)).toEqual(raw);
  });

  it('passes the raw delta through when there is no anchor', () => {
    const raw = { x: 3.5, y: -2.25 };
    expect(snapDelta(null, raw, false)).toEqual(raw);
  });
});

describe('resizedRect', () => {
  const rect = { x: 100, y: 100, w: 400, h: 300 };

  // A free-form node (group/note): both axes resizable, no maximum width.
  const free = { minW: 200, maxW: Infinity, minH: 100, fixedHeight: false };

  it('grows from the south-east corner without moving the origin', () => {
    expect(resizedRect(rect, 'se', { x: 50, y: 40 }, free)).toEqual({
      x: 100,
      y: 100,
      w: 450,
      h: 340,
    });
  });

  it('moves the origin when dragging the north-west corner', () => {
    expect(resizedRect(rect, 'nw', { x: 50, y: 40 }, free)).toEqual({
      x: 150,
      y: 140,
      w: 350,
      h: 260,
    });
  });

  it('keeps the opposite corner pinned', () => {
    const resized = resizedRect(rect, 'nw', { x: 60, y: 60 }, free);
    expect(resized.x + resized.w).toBe(rect.x + rect.w);
    expect(resized.y + resized.h).toBe(rect.y + rect.h);
  });

  it('clamps rather than inverting when dragged past itself', () => {
    const resized = resizedRect(rect, 'se', { x: -10_000, y: -10_000 }, free);

    expect(resized.w).toBe(free.minW);
    expect(resized.h).toBe(free.minH);
  });

  it('holds the pinned edge when clamping from the north-west', () => {
    const resized = resizedRect(rect, 'nw', { x: 10_000, y: 10_000 }, free);

    expect(resized.w).toBe(free.minW);
    expect(resized.x + resized.w).toBe(rect.x + rect.w);
  });

  /**
   * The preview used to clamp against the *table* minimum whatever it was
   * resizing, so a note could never be dragged below 220px wide even though the
   * store would have accepted 150.
   */
  it('honours the caller\'s minimum rather than a single global one', () => {
    const narrow = { minW: 150, maxW: Infinity, minH: 100, fixedHeight: false };
    expect(resizedRect(rect, 'se', { x: -10_000, y: 0 }, narrow).w).toBe(150);
  });

  /**
   * And it had no maximum at all, so a table previewed at whatever width the
   * pointer reached and then visibly snapped back to `maxW` on release.
   */
  it('clamps to the maximum width, holding the pinned edge', () => {
    const capped = { minW: 220, maxW: 420, minH: 68, fixedHeight: true };

    expect(resizedRect(rect, 'se', { x: 10_000, y: 0 }, capped).w).toBe(420);

    const fromWest = resizedRect(rect, 'sw', { x: -10_000, y: 0 }, capped);
    expect(fromWest.w).toBe(420);
    expect(fromWest.x + fromWest.w).toBe(rect.x + rect.w);
  });

  /**
   * A table's height is derived from its column count. Letting a north handle
   * move `y` meant the commit kept the new `y` and the old height, so dragging
   * the top-left corner *downwards* jumped the whole table upwards.
   */
  it('leaves y and h alone for a node whose height is derived', () => {
    const fixed = { minW: 220, maxW: 420, minH: 68, fixedHeight: true };
    const resized = resizedRect(rect, 'nw', { x: 20, y: 60 }, fixed);

    expect(resized.y).toBe(rect.y);
    expect(resized.h).toBe(fixed.minH);
    expect(resized.x).toBe(rect.x + 20);
  });
});

describe('insertionIndex', () => {
  // A route running left to right, so "further along" means "larger x".
  const route: Point[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
  ];

  it('puts the first pin at the start', () => {
    expect(insertionIndex(route, [], { x: 200, y: 0 })).toBe(0);
  });

  it('puts a pin before an existing one that is further along', () => {
    expect(insertionIndex(route, [{ x: 300, y: 0 }], { x: 100, y: 0 })).toBe(0);
  });

  it('puts a pin after an existing one that is earlier', () => {
    expect(insertionIndex(route, [{ x: 100, y: 0 }], { x: 300, y: 0 })).toBe(1);
  });

  /**
   * Order is the whole point: waypoints are visited in sequence, so dropping a
   * pin into the wrong slot makes the route travel backwards to reach it.
   */
  it('slots a pin between two existing ones', () => {
    const pins = [{ x: 100, y: 0 }, { x: 300, y: 0 }];
    expect(insertionIndex(route, pins, { x: 200, y: 0 })).toBe(1);
  });

  it('appends a pin past every existing one', () => {
    const pins = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
    expect(insertionIndex(route, pins, { x: 380, y: 0 })).toBe(2);
  });

  it('measures along the path, not in a straight line', () => {
    // An L: the grab is near the far leg even though it is close to the origin
    // as the crow flies.
    const bent: Point[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
    ];

    expect(insertionIndex(bent, [{ x: 200, y: 0 }], { x: 400, y: 300 })).toBe(1);
  });

  it('appends when there is no route to measure against', () => {
    expect(insertionIndex(undefined, [{ x: 0, y: 0 }], { x: 5, y: 5 })).toBe(1);
  });
});

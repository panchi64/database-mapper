import { describe, expect, it, vi } from 'vitest';
import {
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  ViewportController,
  centerOn,
  clampZoom,
  fitView,
  toScreen,
  toWorld,
  viewportsEqual,
  visibleWorldRect,
  zoomAt,
} from './viewport';

const size = { width: 800, height: 600 };

describe('coordinate transforms', () => {
  it('round-trips world -> screen -> world', () => {
    const vp = { x: 120, y: -40, zoom: 1.75 };
    const world = { x: 321, y: -87 };

    expect(toWorld(toScreen(world, vp), vp).x).toBeCloseTo(world.x);
    expect(toWorld(toScreen(world, vp), vp).y).toBeCloseTo(world.y);
  });

  it('maps the world origin to the viewport offset', () => {
    expect(toScreen({ x: 0, y: 0 }, { x: 50, y: 60, zoom: 2 })).toEqual({ x: 50, y: 60 });
  });

  it('scales distances by the zoom', () => {
    const vp = { x: 0, y: 0, zoom: 2 };
    expect(toScreen({ x: 10, y: 10 }, vp)).toEqual({ x: 20, y: 20 });
  });

  it('reports the visible world rect', () => {
    const rect = visibleWorldRect({ x: -100, y: -50, zoom: 2 }, size);
    expect(rect).toEqual({ x: 50, y: 25, w: 400, h: 300 });
  });
});

describe('zoom', () => {
  it('clamps to the supported range', () => {
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  // The whole point of zoomAt: whatever is under the cursor stays under it.
  it('keeps the anchor point fixed', () => {
    const vp = { x: 30, y: -10, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const before = toWorld(anchor, vp);

    const after = toWorld(anchor, zoomAt(vp, anchor, 2.5));

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('keeps the anchor fixed when zooming out too', () => {
    const vp = { x: 30, y: -10, zoom: 2 };
    const anchor = { x: 123, y: 456 };
    const before = toWorld(anchor, vp);

    const after = toWorld(anchor, zoomAt(vp, anchor, 0.3));

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('returns the same viewport when already clamped', () => {
    const vp = { x: 0, y: 0, zoom: MAX_ZOOM };
    expect(zoomAt(vp, { x: 0, y: 0 }, 2)).toBe(vp);
  });
});

describe('camera moves', () => {
  it('centres a world point', () => {
    const vp = centerOn({ x: 100, y: 100 }, size, 1);
    expect(toScreen({ x: 100, y: 100 }, vp)).toEqual({ x: 400, y: 300 });
  });

  it('centres correctly at a non-unit zoom', () => {
    const vp = centerOn({ x: 100, y: 100 }, size, 2);
    const screen = toScreen({ x: 100, y: 100 }, vp);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });
});

describe('fitView', () => {
  it('frames the bounds within the padding', () => {
    const bounds = { x: 0, y: 0, w: 1600, h: 1200 };
    const vp = fitView(bounds, size, 50);

    const topLeft = toScreen({ x: bounds.x, y: bounds.y }, vp);
    const bottomRight = toScreen({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, vp);

    expect(topLeft.x).toBeGreaterThanOrEqual(49);
    expect(topLeft.y).toBeGreaterThanOrEqual(49);
    expect(bottomRight.x).toBeLessThanOrEqual(size.width - 49);
    expect(bottomRight.y).toBeLessThanOrEqual(size.height - 49);
  });

  it('centres the bounds', () => {
    const bounds = { x: 100, y: 100, w: 200, h: 200 };
    const vp = fitView(bounds, size);
    const center = toScreen({ x: 200, y: 200 }, vp);

    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it('does not zoom past maxZoom for a tiny diagram', () => {
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, size).zoom).toBe(1);
  });

  it('zooms out for an oversized diagram', () => {
    expect(fitView({ x: 0, y: 0, w: 8000, h: 6000 }, size).zoom).toBeLessThan(1);
  });

  it('falls back to the identity for an empty diagram', () => {
    expect(fitView({ x: 0, y: 0, w: 0, h: 0 }, size)).toEqual(IDENTITY);
  });

  it('falls back to the identity before the canvas has a size', () => {
    expect(fitView({ x: 0, y: 0, w: 100, h: 100 }, { width: 0, height: 0 })).toEqual(IDENTITY);
  });
});

describe('ViewportController', () => {
  it('notifies subscribers on change', () => {
    const c = new ViewportController();
    const listener = vi.fn();
    c.subscribe(listener);

    c.set({ x: 10, y: 10, zoom: 1 });

    expect(listener).toHaveBeenCalledWith({ x: 10, y: 10, zoom: 1 });
  });

  it('does not notify when nothing actually changed', () => {
    const c = new ViewportController({ x: 5, y: 5, zoom: 1 });
    const listener = vi.fn();
    c.subscribe(listener);

    c.set({ x: 5, y: 5, zoom: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const c = new ViewportController();
    const listener = vi.fn();
    c.subscribe(listener)();

    c.set({ x: 1, y: 1, zoom: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('applies an update function', () => {
    const c = new ViewportController({ x: 0, y: 0, zoom: 1 });
    c.update((vp) => ({ ...vp, x: vp.x + 25 }));
    expect(c.get().x).toBe(25);
  });

  it('compares viewports by value', () => {
    expect(viewportsEqual({ x: 1, y: 2, zoom: 3 }, { x: 1, y: 2, zoom: 3 })).toBe(true);
    expect(viewportsEqual({ x: 1, y: 2, zoom: 3 }, { x: 1, y: 2, zoom: 3.1 })).toBe(false);
  });
});

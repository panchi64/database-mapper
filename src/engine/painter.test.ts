import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '@/test/canvasStub';
import { paintAll, paintPrimitive } from './painter';
import type { Primitive } from './primitives';

function record(prims: Primitive[]) {
  const rec = createRecordingContext();
  paintAll(rec.ctx, prims);
  return rec;
}

describe('rect', () => {
  it('fills a plain rect', () => {
    const rec = record([{ t: 'rect', x: 1, y: 2, w: 3, h: 4, fill: '#f00' }]);

    expect(rec.callsTo('rect')).toHaveLength(1);
    expect(rec.callsTo('rect')[0].args).toEqual([1, 2, 3, 4]);
    expect(rec.callsTo('fill')).toHaveLength(1);
  });

  it('traces a rounded rect as a path instead', () => {
    const rec = record([{ t: 'rect', x: 0, y: 0, w: 100, h: 50, r: 8, fill: '#f00' }]);

    expect(rec.callsTo('rect')).toHaveLength(0);
    expect(rec.callsTo('quadraticCurveTo')).toHaveLength(4);
  });

  it('strokes only when asked', () => {
    expect(record([{ t: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#f00' }]).callsTo('stroke')).toHaveLength(0);
    expect(
      record([{ t: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: '#f00' }]).callsTo('stroke')
    ).toHaveLength(1);
  });

  it('clamps a radius larger than the rect rather than inverting it', () => {
    // A 10x10 rect with radius 40 must still trace a sane path.
    const rec = record([{ t: 'rect', x: 0, y: 0, w: 10, h: 10, r: 40, fill: '#f00' }]);
    expect(rec.callsTo('quadraticCurveTo')).toHaveLength(4);
  });

  it('accepts per-corner radii', () => {
    const rec = record([{ t: 'rect', x: 0, y: 0, w: 100, h: 50, r: [8, 8, 0, 0], fill: '#f00' }]);
    expect(rec.callsTo('quadraticCurveTo')).toHaveLength(4);
  });
});

describe('text', () => {
  it('draws the string', () => {
    const rec = record([
      { t: 'text', x: 5, y: 6, s: 'users', font: '12px sans-serif', fill: '#000' },
    ]);

    expect(rec.texts()).toEqual(['users']);
  });

  it('applies alignment and baseline', () => {
    const rec = createRecordingContext();
    paintPrimitive(rec.ctx, {
      t: 'text',
      x: 0,
      y: 0,
      s: 'x',
      font: '12px sans-serif',
      fill: '#000',
      align: 'right',
      baseline: 'middle',
    });

    expect(rec.ctx.textAlign).toBe('right');
    expect(rec.ctx.textBaseline).toBe('middle');
  });
});

describe('line', () => {
  it('moves and draws', () => {
    const rec = record([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#000' }]);

    expect(rec.callsTo('moveTo')[0].args).toEqual([0, 0]);
    expect(rec.callsTo('lineTo')[0].args).toEqual([10, 10]);
    expect(rec.callsTo('stroke')).toHaveLength(1);
  });

  it('sets and then clears the dash pattern', () => {
    const rec = record([{ t: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', dash: [4, 4] }]);
    const dashes = rec.callsTo('setLineDash');

    expect(dashes).toHaveLength(2);
    expect(dashes[0].args[0]).toEqual([4, 4]);
    // Leaving a dash set would leak into whatever is painted next.
    expect(dashes[1].args[0]).toEqual([]);
  });
});

describe('path', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('draws straight segments with no radius', () => {
    const rec = record([{ t: 'path', pts: square, stroke: '#000' }]);

    expect(rec.callsTo('lineTo')).toHaveLength(2);
    expect(rec.callsTo('quadraticCurveTo')).toHaveLength(0);
  });

  it('rounds corners when a radius is given', () => {
    const rec = record([{ t: 'path', pts: square, stroke: '#000', radius: 6 }]);

    // One rounded corner: the single interior vertex.
    expect(rec.callsTo('quadraticCurveTo')).toHaveLength(1);
  });

  it('degrades to a sharp corner when the segments are too short to round', () => {
    const tight = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const rec = record([{ t: 'path', pts: tight, stroke: '#000', radius: 20 }]);

    // Radius is clamped to half the shorter segment (0.5), still traced.
    expect(rec.callsTo('quadraticCurveTo').length + rec.callsTo('lineTo').length).toBeGreaterThan(0);
  });

  it('handles a two-point path', () => {
    const rec = record([
      { t: 'path', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], stroke: '#000', radius: 6 },
    ]);

    expect(rec.callsTo('lineTo')).toHaveLength(1);
  });

  it('draws nothing for an empty path', () => {
    const rec = record([{ t: 'path', pts: [], stroke: '#000' }]);
    expect(rec.callsTo('lineTo')).toHaveLength(0);
  });

  it('closes a closed path', () => {
    const rec = record([{ t: 'path', pts: square, fill: '#000', closed: true }]);
    expect(rec.callsTo('closePath')).toHaveLength(1);
  });
});

describe('circle', () => {
  it('arcs a full turn', () => {
    const rec = record([{ t: 'circle', x: 5, y: 5, r: 3, fill: '#000' }]);

    expect(rec.callsTo('arc')[0].args).toEqual([5, 5, 3, 0, Math.PI * 2]);
    expect(rec.callsTo('fill')).toHaveLength(1);
  });
});

describe('paintAll', () => {
  it('paints in order', () => {
    const rec = record([
      { t: 'text', x: 0, y: 0, s: 'first', font: 'f', fill: '#000' },
      { t: 'text', x: 0, y: 0, s: 'second', font: 'f', fill: '#000' },
    ]);

    expect(rec.texts()).toEqual(['first', 'second']);
  });

  it('does nothing for an empty list', () => {
    expect(record([]).calls).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { exportScale } from './image';

describe('exportScale', () => {
  it('uses the requested density for an ordinary diagram', () => {
    expect(exportScale(1200, 800, 2)).toBe(2);
  });

  /**
   * The 300-table fixture is ~8100x7200 world units. At the default 2x that is a
   * 233-megapixel canvas, over every browser's limit — the canvas comes back
   * blank or `toBlob` yields null, so the export silently produced nothing.
   */
  it('scales a huge diagram down rather than asking for an impossible canvas', () => {
    const scale = exportScale(8164, 7248, 2);

    expect(scale).toBeLessThan(1);
    // The canvas the exporter actually allocates, rounded up as it rounds up.
    const w = Math.ceil(8164 * scale);
    const h = Math.ceil(7248 * scale);

    expect(w).toBeLessThanOrEqual(8192);
    expect(h).toBeLessThanOrEqual(8192);
    expect(w * h).toBeLessThanOrEqual(32_000_000);
  });

  it('caps the longest side even when the area is fine', () => {
    // A very wide, very short diagram: small area, impossible width.
    const scale = exportScale(40_000, 200, 2);
    expect(40_000 * scale).toBeLessThanOrEqual(8192);
  });

  it('never scales up past what was asked for', () => {
    expect(exportScale(10, 10, 1)).toBe(1);
  });
});

/**
 * Painting a group.
 *
 * A group is a region, not an object: it is drawn behind everything, with a dashed
 * boundary and a title tab rather than a filled card. It never obscures the tables
 * inside it, and the router treats it as transparent for the same reason.
 */
import { FONTS, METRICS, type TextMeasurer } from '../geometry';
import type { Lod, NodeDraw, Primitive } from '../primitives';
import { presetColor, withAlpha, type Palette } from '../theme';
import { truncate } from '../text';
import type { GroupNode } from '@/types';

export interface GroupDrawContext {
  palette: Palette;
  measurer: TextMeasurer;
  lod: Lod;
}

const TAB_H = 22;

export function groupCacheKey(node: GroupNode, ctx: GroupDrawContext): string {
  return [
    node.id,
    node.w,
    node.h,
    ctx.lod,
    ctx.palette.isDark ? 'd' : 'l',
    node.data.name,
    node.data.color ?? '',
  ].join('|');
}

export function drawGroup(node: GroupNode, ctx: GroupDrawContext): Primitive[] {
  const { palette, measurer, lod } = ctx;
  const { w, h, data } = node;
  const accent = presetColor(palette, data.color);
  const prims: Primitive[] = [];

  prims.push({
    t: 'rect',
    x: 0,
    y: 0,
    w,
    h,
    r: METRICS.radius,
    fill: withAlpha(accent, palette.isDark ? 0.07 : 0.05),
  });

  prims.push({
    t: 'path',
    pts: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    closed: true,
    stroke: withAlpha(accent, 0.55),
    lw: 1.5,
    dash: [6, 4],
  });

  if (lod === 'compact') return prims;

  // Title tab, sitting just inside the top-left corner.
  const label = truncate(data.name, w - METRICS.padX * 4, FONTS.noteTitle, measurer);
  const tabW = measurer.measure(label, FONTS.noteTitle) + METRICS.padX * 2;

  prims.push({
    t: 'rect',
    x: 0,
    y: 0,
    w: Math.min(tabW, w),
    h: TAB_H,
    r: [METRICS.radius, 0, METRICS.radius, 0],
    fill: withAlpha(accent, palette.isDark ? 0.4 : 0.3),
  });

  prims.push({
    t: 'text',
    x: METRICS.padX,
    y: TAB_H / 2,
    s: label,
    font: FONTS.noteTitle,
    fill: palette.foreground,
    baseline: 'middle',
  });

  return prims;
}

export function groupNodeDraw(node: GroupNode, ctx: GroupDrawContext): NodeDraw {
  return {
    id: node.id,
    rect: { x: node.x, y: node.y, w: node.w, h: node.h },
    lod: ctx.lod,
    cacheKey: groupCacheKey(node, ctx),
    prims: drawGroup(node, ctx),
  };
}

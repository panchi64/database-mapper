/**
 * Painting a note.
 *
 * Notes read as paper against the tables' cards: a tinted body, a folded corner,
 * and a coloured spine down the left edge. That separation matters more now that
 * both are drawn by the same engine with the same corner radius.
 */
import { FONTS, METRICS, type TextMeasurer } from '../geometry';
import type { Lod, NodeDraw, Primitive } from '../primitives';
import { presetColor, withAlpha, type Palette } from '../theme';
import { truncate, wrapText } from '../text';
import type { NoteNode } from '@/types';

export interface NoteDrawContext {
  palette: Palette;
  measurer: TextMeasurer;
  lod: Lod;
}

const SPINE_W = 4;
const FOLD = 14;
const TITLE_H = 24;
const LINE_H = 17;

export function noteCacheKey(node: NoteNode, ctx: NoteDrawContext): string {
  return [
    node.id,
    node.w,
    node.h,
    ctx.lod,
    ctx.palette.isDark ? 'd' : 'l',
    node.data.name,
    node.data.color ?? '',
    node.data.content,
  ].join('|');
}

export function drawNote(node: NoteNode, ctx: NoteDrawContext): Primitive[] {
  const { palette, measurer, lod } = ctx;
  const { w, h, data } = node;
  const accent = presetColor(palette, data.color, 'yellow');
  const prims: Primitive[] = [];

  // Rounded at the top right only — a dog-eared page.
  //
  // The left edge is square because the 4px spine cannot follow a 10px corner
  // radius; its corners escaped the body outline. The bottom right is square for
  // the same reason: the fold is a triangle meeting the corner exactly, so a
  // radius there cut the corner away and left the fold hanging outside it.
  prims.push({
    t: 'rect',
    x: 0,
    y: 0,
    w,
    h,
    r: [0, METRICS.radius, 0, 0],
    fill: withAlpha(accent, palette.isDark ? 0.14 : 0.12),
    stroke: withAlpha(accent, 0.5),
    lw: METRICS.borderW,
  });

  // Coloured spine, flush with the square left edge.
  prims.push({ t: 'rect', x: 0, y: 0, w: SPINE_W, h, fill: accent });

  // The dog-ear, meeting the now-square bottom-right corner exactly.
  prims.push({
    t: 'path',
    pts: [
      { x: w - FOLD, y: h },
      { x: w, y: h - FOLD },
      { x: w, y: h },
    ],
    closed: true,
    fill: withAlpha(accent, palette.isDark ? 0.35 : 0.28),
  });
  // A crease line, so the fold reads as folded rather than as a stray triangle.
  prims.push({
    t: 'line',
    x1: w - FOLD,
    y1: h,
    x2: w,
    y2: h - FOLD,
    stroke: withAlpha(accent, 0.65),
    lw: METRICS.borderW,
  });

  if (lod === 'compact') return prims;

  const padX = SPINE_W + METRICS.padX;
  const textW = w - padX - METRICS.padX;

  prims.push({
    t: 'text',
    x: padX,
    y: TITLE_H / 2 + 6,
    s: truncate(data.name, textW, FONTS.noteTitle, measurer),
    font: FONTS.noteTitle,
    fill: palette.foreground,
    baseline: 'middle',
  });

  // Only as many lines as actually fit; the rest is simply not drawn rather than
  // spilling past the border.
  const bodyTop = TITLE_H + 10;
  const maxLines = Math.max(0, Math.floor((h - bodyTop - METRICS.padX) / LINE_H));

  wrapText(data.content, textW, FONTS.note, measurer, maxLines).forEach((line, i) => {
    prims.push({
      t: 'text',
      x: padX,
      y: bodyTop + i * LINE_H + LINE_H / 2,
      s: line,
      font: FONTS.note,
      fill: palette.rowText,
      baseline: 'middle',
    });
  });

  return prims;
}

export function noteNodeDraw(node: NoteNode, ctx: NoteDrawContext): NodeDraw {
  return {
    id: node.id,
    rect: { x: node.x, y: node.y, w: node.w, h: node.h },
    lod: ctx.lod,
    cacheKey: noteCacheKey(node, ctx),
    prims: drawNote(node, ctx),
  };
}

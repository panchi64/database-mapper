/**
 * Painting a table.
 *
 * The redesign lives here and in `METRICS`. Notable departures from the old DOM
 * rendering, now that layout is ours:
 *
 * - Rows are a fixed height with a hairline divider, so a column's vertical centre
 *   is exactly where `columnPort` says it is.
 * - The header carries a colour wash rather than a solid fill, so eight table
 *   colours stay legible against one card background in both themes.
 * - Indicators are drawn as compact glyphs (a key bar for PK, a tinted pill for FK
 *   and unique) instead of the DOM's mixed icon/badge/`?` vocabulary.
 * - Below `METRICS.lodCompact` the whole thing collapses to a titled block, which
 *   is what keeps a 300-table diagram at 60fps.
 */
import { FONTS, METRICS, tableHeaderH, type TextMeasurer } from '../geometry';
import type { Lod, NodeDraw, Primitive } from '../primitives';
import { headerFill, presetColor, withAlpha, type Palette } from '../theme';
import { truncate } from '../text';
import type { Column, SearchHighlight, TableNode } from '@/types';

export interface TableDrawContext {
  palette: Palette;
  measurer: TextMeasurer;
  lod: Lod;
  highlight?: SearchHighlight;
}

/** Everything that changes what the cached bitmap looks like. */
export function tableCacheKey(node: TableNode, ctx: TableDrawContext): string {
  const d = node.data;
  const columns = d.columns
    .map((c) => `${c.id}:${c.name}:${c.dataType}:${c.length ?? ''}:${+c.primaryKey}${+c.unique}${+c.nullable}${c.foreignKey ? 1 : 0}`)
    .join(',');

  const hl = ctx.highlight
    ? `${+ctx.highlight.tableNameMatch}:${ctx.highlight.matchingColumnIds.join('.')}`
    : '';

  return [
    node.id,
    node.w,
    node.h,
    ctx.lod,
    ctx.palette.isDark ? 'd' : 'l',
    d.name,
    d.color ?? '',
    d.comment ?? '',
    hl,
    columns,
  ].join('|');
}

function typeLabel(column: Column): string {
  return column.length ? `${column.dataType}(${column.length})` : column.dataType;
}

/**
 * A short pill used for FK and UNIQUE. Returns the width consumed so the caller
 * can advance the cursor.
 */
function pill(
  prims: Primitive[],
  x: number,
  centerY: number,
  text: string,
  color: string,
  measurer: TextMeasurer
): number {
  const padding = 4;
  const w = measurer.measure(text, FONTS.badge) + padding * 2;
  const h = 13;

  prims.push({
    t: 'rect',
    x,
    y: centerY - h / 2,
    w,
    h,
    r: 3,
    fill: withAlpha(color, 0.18),
  });
  prims.push({
    t: 'text',
    x: x + padding,
    y: centerY,
    s: text,
    font: FONTS.badge,
    fill: color,
    baseline: 'middle',
  });

  return w;
}

function drawColumnRow(
  prims: Primitive[],
  column: Column,
  top: number,
  width: number,
  ctx: TableDrawContext,
  highlighted: boolean
): void {
  const { palette, measurer } = ctx;
  const centerY = top + METRICS.rowH / 2;

  if (highlighted) {
    prims.push({ t: 'rect', x: 0, y: top, w: width, h: METRICS.rowH, fill: palette.highlight });
    prims.push({ t: 'rect', x: 0, y: top, w: 2, h: METRICS.rowH, fill: palette.highlightRing });
  }

  let cursor = METRICS.padX;

  // Primary key: a solid amber bar. Reads as "this is the key" without an icon
  // font, and stays legible at small zoom where a key glyph turns to mush.
  if (column.primaryKey) {
    prims.push({
      t: 'rect',
      x: cursor,
      y: centerY - 5,
      w: 3,
      h: 10,
      r: 1.5,
      fill: palette.presets.yellow,
    });
    cursor += 3 + METRICS.indicatorGap;
  }

  if (column.foreignKey) {
    cursor += pill(prims, cursor, centerY, 'FK', palette.presets.blue, measurer) + METRICS.indicatorGap;
  }

  if (column.unique && !column.primaryKey) {
    cursor += pill(prims, cursor, centerY, 'U', palette.presets.purple, measurer) + METRICS.indicatorGap;
  }

  // Reserve the type label's space before truncating the name, so a long name
  // never pushes the type off the row.
  const type = typeLabel(column);
  const typeW = measurer.measure(type, FONTS.type);
  const nameBudget = width - cursor - METRICS.padX - typeW - METRICS.colGap;

  prims.push({
    t: 'text',
    x: cursor,
    y: centerY,
    s: truncate(column.name, nameBudget, FONTS.row, measurer),
    font: FONTS.row,
    fill: palette.rowText,
    baseline: 'middle',
  });

  // A nullable column is marked by dimming its type rather than a trailing `?`,
  // which used to collide with the type label on narrow tables.
  prims.push({
    t: 'text',
    x: width - METRICS.padX,
    y: centerY,
    s: type,
    font: FONTS.type,
    fill: column.nullable ? withAlphaFromPalette(palette) : palette.typeText,
    align: 'right',
    baseline: 'middle',
  });
}

function withAlphaFromPalette(palette: Palette): string {
  // `typeText` is already an hsl() string; layering opacity on it keeps the hue.
  return palette.typeText.startsWith('hsl(')
    ? palette.typeText.replace(/\)$/, ' / 0.55)')
    : palette.typeText;
}

/** Local-coordinate primitives for a table at the given level of detail. */
export function drawTable(node: TableNode, ctx: TableDrawContext): Primitive[] {
  const { palette, measurer, lod } = ctx;
  const { w, h, data } = node;
  const prims: Primitive[] = [];

  const accent = presetColor(palette, data.color);

  // Body.
  //
  // Square across the top, rounded only at the bottom. The accent stripe is a
  // 3px band, so a rounded top corner would have to curve within those 3px while
  // the body curves over 10 — the stripe's corners escaped the body's outline.
  // Squaring the top lets the stripe sit flush and reads as a tab besides.
  prims.push({
    t: 'rect',
    x: 0,
    y: 0,
    w,
    h,
    r: [0, 0, METRICS.radius, METRICS.radius],
    fill: palette.nodeBg,
    stroke: palette.nodeBorder,
    lw: METRICS.borderW,
  });

  const headerH = tableHeaderH(data);

  prims.push({
    t: 'rect',
    x: 0,
    y: 0,
    w,
    h: headerH,
    fill: headerFill(palette, data.color),
  });

  // Accent stripe: the clearest signal of a table's colour at any zoom.
  prims.push({ t: 'rect', x: 0, y: 0, w, h: 3, fill: accent });

  if (ctx.highlight?.tableNameMatch) {
    prims.push({
      t: 'rect',
      x: 0,
      y: 0,
      w,
      h: headerH,
      stroke: palette.highlightRing,
      lw: 2,
    });
  }

  const titleY = data.comment ? METRICS.headerH / 2 + 2 : headerH / 2;
  prims.push({
    t: 'text',
    x: METRICS.padX,
    y: titleY,
    s: truncate(data.name, w - METRICS.padX * 2, FONTS.title, measurer),
    font: FONTS.title,
    fill: palette.foreground,
    baseline: 'middle',
  });

  if (data.comment) {
    prims.push({
      t: 'text',
      x: METRICS.padX,
      y: METRICS.headerH + METRICS.headerCommentH / 2 - 2,
      s: truncate(data.comment, w - METRICS.padX * 2, FONTS.comment, measurer),
      font: FONTS.comment,
      fill: palette.typeText,
      baseline: 'middle',
    });
  }

  // At low zoom the rows are sub-pixel noise; stop here.
  if (lod === 'compact') {
    prims.push({
      t: 'rect',
      x: 0,
      y: headerH,
      w,
      h: h - headerH,
      r: [0, 0, METRICS.radius, METRICS.radius],
      fill: withAlpha(accent, palette.isDark ? 0.08 : 0.05),
    });
    return prims;
  }

  prims.push({
    t: 'line',
    x1: 0,
    y1: headerH,
    x2: w,
    y2: headerH,
    stroke: palette.nodeBorder,
    lw: METRICS.borderW,
  });

  if (data.columns.length === 0) {
    prims.push({
      t: 'text',
      x: METRICS.padX,
      y: headerH + METRICS.emptyRowH / 2,
      s: 'No columns',
      font: FONTS.type,
      fill: palette.typeText,
      baseline: 'middle',
    });
    return prims;
  }

  const highlighted = new Set(ctx.highlight?.matchingColumnIds ?? []);

  data.columns.forEach((column, index) => {
    const top = headerH + index * METRICS.rowH;
    drawColumnRow(prims, column, top, w, ctx, highlighted.has(column.id));

    if (index < data.columns.length - 1) {
      const y = top + METRICS.rowH;
      prims.push({
        t: 'line',
        x1: METRICS.padX,
        y1: y,
        x2: w - METRICS.padX,
        y2: y,
        stroke: palette.rowDivider,
        lw: METRICS.borderW,
      });
    }
  });

  return prims;
}

export function tableNodeDraw(node: TableNode, ctx: TableDrawContext): NodeDraw {
  return {
    id: node.id,
    rect: { x: node.x, y: node.y, w: node.w, h: node.h },
    lod: ctx.lod,
    cacheKey: tableCacheKey(node, ctx),
    prims: drawTable(node, ctx),
  };
}

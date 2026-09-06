/**
 * Deterministic diagram geometry.
 *
 * This is the keystone of the canvas engine. Under React Flow, a table's height
 * and its per-column connection points were whatever the DOM happened to lay out,
 * measured after the fact and never written down — so nothing outside the renderer
 * could reason about where a column actually was. Edge routing and the
 * click-to-connect picker both need that answer *before* anything is drawn.
 *
 * So layout is computed here, from data, as pure functions. No DOM, no canvas, no
 * React. Everything in this file is trivially unit-testable, and every other module
 * (renderer, router, hit-testing, layout, export) derives its coordinates from it.
 *
 * All coordinates are **world** coordinates unless a name says otherwise.
 */
import type { Column, DBNode, Side, TableNode, TableNodeData } from '@/types';

export type { Side };

/** Anything that can tell us how wide a string renders. Canvas2D satisfies this. */
export interface TextMeasurer {
  measure(text: string, font: string): number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

/**
 * The single source of truth for the diagram's visual proportions.
 *
 * Nothing else in the engine may hard-code a pixel value that belongs here — the
 * renderer, the router and the hit-tester all read these, so changing a number
 * here changes the drawing, the routing and the click targets together.
 */
export const METRICS = {
  /** Table header band, holding the name. */
  headerH: 40,
  /** Extra band below the header when a table has a comment. */
  headerCommentH: 18,
  /** One column row. */
  rowH: 28,
  /** Placeholder row shown when a table has no columns yet. */
  emptyRowH: 32,

  /** Horizontal padding inside a table, both edges. */
  padX: 12,
  /** Minimum gap between a column's name and its data type. */
  colGap: 16,

  minW: 220,
  maxW: 420,
  defaultW: 260,

  /** Group and note defaults. */
  groupDefaultW: 400,
  groupDefaultH: 300,
  groupMinW: 200,
  groupMinH: 100,
  noteDefaultW: 240,
  noteDefaultH: 160,
  noteMinW: 150,
  noteMinH: 100,

  /** Connection port radius, and its (larger) click target. Both in screen px. */
  portR: 5,
  portHitR: 12,

  /** Corner rounding on table/note/group bodies. */
  radius: 10,
  borderW: 1,

  /** Canvas grid step. Node drags snap to this. */
  gridSnap: 15,

  /**
   * Widths reserved for the inline indicators on a column row. Approximations are
   * fine — they only feed intrinsic width, which is clamped to [minW, maxW] anyway.
   */
  pkIconW: 14,
  badgeW: 20,
  indicatorGap: 6,

  /** Below this zoom a table draws as a header-only block and ports stop responding. */
  lodCompact: 0.4,
} as const;

const SYSTEM_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Fonts as canvas `font` strings. A system stack means no webfont download, no
 * FOUT, and no bundle cost — which matters when the whole app ships as one file.
 */
export const FONTS = {
  title: `600 14px ${SYSTEM_STACK}`,
  row: `400 13px ${SYSTEM_STACK}`,
  type: `400 11px ${SYSTEM_STACK}`,
  comment: `400 11px ${SYSTEM_STACK}`,
  note: `400 13px ${SYSTEM_STACK}`,
  noteTitle: `600 13px ${SYSTEM_STACK}`,
  badge: `600 9px ${SYSTEM_STACK}`,
  edgeLabel: `500 11px ${SYSTEM_STACK}`,
} as const;

// --- Rect helpers -----------------------------------------------------------

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Grow (or, with a negative amount, shrink) a rect on every side. */
export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

/** Smallest rect containing all of `rects`. Zero-size rect at the origin if empty. */
export function unionBBox(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// --- Node geometry ----------------------------------------------------------

export function nodeRect(node: DBNode): Rect {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

export function diagramBounds(nodes: DBNode[]): Rect {
  return unionBBox(nodes.map(nodeRect));
}

/** Height of a table's header, including the comment band when there is one. */
export function tableHeaderH(data: TableNodeData): number {
  return METRICS.headerH + (data.comment ? METRICS.headerCommentH : 0);
}

/**
 * Height a table needs to show all of its columns.
 *
 * Tables auto-size vertically rather than scrolling internally. A scrollable table
 * would be able to hide a column, and a hidden column has no on-screen port for an
 * edge to attach to — which would put us right back to undefined geometry.
 */
export function intrinsicTableHeight(data: TableNodeData): number {
  const body =
    data.columns.length > 0 ? data.columns.length * METRICS.rowH : METRICS.emptyRowH;
  return tableHeaderH(data) + body;
}

/** Width one column row wants, before clamping. */
function columnIntrinsicWidth(column: Column, m: TextMeasurer): number {
  let indicators = 0;
  if (column.primaryKey) indicators += METRICS.pkIconW + METRICS.indicatorGap;
  if (column.foreignKey) indicators += METRICS.badgeW + METRICS.indicatorGap;
  if (column.unique && !column.primaryKey) indicators += METRICS.badgeW + METRICS.indicatorGap;
  if (column.nullable) indicators += 8 + METRICS.indicatorGap;

  const typeLabel = column.length ? `${column.dataType}(${column.length})` : column.dataType;

  return (
    METRICS.padX * 2 +
    indicators +
    m.measure(column.name, FONTS.row) +
    METRICS.colGap +
    m.measure(typeLabel, FONTS.type)
  );
}

/**
 * The size a table would like to be, clamped to [minW, maxW].
 *
 * Width is a preference — the user may resize within the clamp — but height is
 * derived and authoritative, per `intrinsicTableHeight`.
 */
export function intrinsicTableSize(data: TableNodeData, m: TextMeasurer): Size {
  // Header must fit the name plus its leading icon.
  let widest = METRICS.padX * 2 + METRICS.pkIconW + METRICS.indicatorGap +
    m.measure(data.name, FONTS.title);

  if (data.comment) {
    widest = Math.max(widest, METRICS.padX * 2 + m.measure(data.comment, FONTS.comment));
  }

  for (const column of data.columns) {
    widest = Math.max(widest, columnIntrinsicWidth(column, m));
  }

  return {
    w: Math.round(clamp(widest, METRICS.minW, METRICS.maxW)),
    h: intrinsicTableHeight(data),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** What a resize is allowed to do to a node. */
export interface SizeLimits {
  minW: number;
  maxW: number;
  minH: number;
  /**
   * True when the height is derived rather than user-set (tables). A resize must
   * leave both `y` and `h` alone for these, or dragging a top handle translates
   * the node instead of resizing it.
   */
  fixedHeight: boolean;
}

/**
 * The size constraints for one node, by type.
 *
 * The single source of truth for both ends of a resize: `resizedRect` clamps the
 * live preview with it and the store clamps the commit with it. They used to
 * clamp against different constants, so a note could not be previewed below the
 * *table* minimum width and a table could be previewed wider than it would
 * commit — the shape visibly snapped on release.
 */
export function nodeSizeLimits(node: DBNode): SizeLimits {
  switch (node.type) {
    case 'table':
      return {
        minW: METRICS.minW,
        maxW: METRICS.maxW,
        minH: intrinsicTableHeight(node.data),
        fixedHeight: true,
      };
    case 'group':
      return {
        minW: METRICS.groupMinW,
        maxW: Infinity,
        minH: METRICS.groupMinH,
        fixedHeight: false,
      };
    case 'note':
      return {
        minW: METRICS.noteMinW,
        maxW: Infinity,
        minH: METRICS.noteMinH,
        fixedHeight: false,
      };
  }
}

// --- Column rows ------------------------------------------------------------

/** World-space rect of the column at `index`, whether or not that index exists. */
export function tableRowRect(node: TableNode, index: number): Rect {
  return {
    x: node.x,
    y: node.y + tableHeaderH(node.data) + index * METRICS.rowH,
    w: node.w,
    h: METRICS.rowH,
  };
}

/** Row index of a column, or -1 when the table has no such column. */
export function columnIndex(node: TableNode, columnId: string): number {
  return node.data.columns.findIndex((c) => c.id === columnId);
}

/** Rect of a specific column, or null when the column isn't in this table. */
export function columnRect(node: TableNode, columnId: string): Rect | null {
  const index = columnIndex(node, columnId);
  return index === -1 ? null : tableRowRect(node, index);
}

/** Which column row a world point falls in, or null for the header/outside. */
export function tableRowAt(node: TableNode, world: Point): Column | null {
  if (!pointInRect(world, nodeRect(node))) return null;

  const bodyTop = node.y + tableHeaderH(node.data);
  if (world.y < bodyTop) return null; // header, not a row

  const index = Math.floor((world.y - bodyTop) / METRICS.rowH);
  return node.data.columns[index] ?? null;
}

// --- Connection ports -------------------------------------------------------

/** Midpoint of one side of a node. Used for whole-node (note/table) endpoints. */
export function nodePort(node: DBNode, side: Side): Point {
  const r = nodeRect(node);
  switch (side) {
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
  }
}

/**
 * Where an edge anchored to a specific column meets the table's edge.
 *
 * Vertically centred on that column's row; horizontally on the requested side.
 * `top`/`bottom` fall back to the node-level port, since a column has no
 * meaningful top edge of its own. Null when the column isn't in this table.
 */
export function columnPort(node: TableNode, columnId: string, side: Side): Point | null {
  const rect = columnRect(node, columnId);
  if (!rect) return null;

  switch (side) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.h / 2 };
    case 'right':
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
    case 'top':
    case 'bottom':
      return nodePort(node, side);
  }
}

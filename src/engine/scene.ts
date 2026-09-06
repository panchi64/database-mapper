/**
 * Assembling a frame.
 *
 * `buildScene` turns application state into a `Scene` — a plain data structure of
 * what to draw and where. It performs culling and level-of-detail selection, and
 * nothing else: no canvas, no DOM, no side effects. That makes the whole frame
 * assertable in a unit test, and lets the SVG exporter reuse it verbatim.
 */
import {
  METRICS,
  columnPort,
  nodeRect,
  rectsIntersect,
  type Point,
  type Rect,
  type TextMeasurer,
} from './geometry';
import type { EdgeDraw, Lod, NodeDraw, Primitive, Scene } from './primitives';
import type { Palette } from './theme';
import { visibleWorldRect, type Size, type Viewport } from './viewport';
import { groupNodeDraw } from './draw/group';
import { noteNodeDraw } from './draw/note';
import { tableNodeDraw } from './draw/table';
import { drawEdge, edgeColor, edgeLabelPrims } from './draw/edge';
import type { RouteMap } from './routing';
import type { DBEdge, DBNode, SearchHighlight, TableNode } from '@/types';

export interface SceneInput {
  nodes: readonly DBNode[];
  edges: readonly DBEdge[];
  routes: RouteMap;
  viewport: Viewport;
  size: Size;
  palette: Palette;
  measurer: TextMeasurer;

  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  searchHighlights?: ReadonlyMap<string, SearchHighlight>;

  hoveredNodeId?: string | null;
  hoveredEdgeId?: string | null;

  /** Marquee rect in world coordinates, while a selection drag is in progress. */
  marquee?: Rect | null;
  /** Rubber-band line while dragging a new connection out of a port. */
  pendingConnection?: { from: Point; to: Point } | null;
  /** Pinned waypoints of the selected edge, so grab handles can be drawn. */
  selectedEdgeWaypoints?: readonly Point[];
  /** Live endpoint being re-anchored, drawn following the pointer. */
  movingEnd?: { edgeId: string; which: 'source' | 'target'; point: Point } | null;
  /** Suppress the grid (used by the minimap, which reuses this builder). */
  showGrid?: boolean;
}

export function lodForZoom(zoom: number): Lod {
  return zoom < METRICS.lodCompact ? 'compact' : 'full';
}

/**
 * How far outside the viewport to keep drawing.
 *
 * Culling exactly at the edge makes edges attached to just-off-screen nodes pop in
 * and out; a margin of a screenful of world units avoids that at negligible cost.
 */
function cullRect(world: Rect): Rect {
  const margin = Math.max(world.w, world.h) * 0.25;
  return { x: world.x - margin, y: world.y - margin, w: world.w + margin * 2, h: world.h + margin * 2 };
}

function selectionRing(rect: Rect, palette: Palette): Primitive {
  const pad = 3;
  return {
    t: 'rect',
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
    r: METRICS.radius + pad,
    stroke: palette.selectionRing,
    lw: 2,
  };
}

/**
 * Ports for the hovered table.
 *
 * Only ever shown for one node at a time. Painting every port of every table was
 * what made the old canvas look like a pegboard, and it is also the main reason
 * connecting felt like a precision task.
 */
function portPrims(node: DBNode, palette: Palette): Primitive[] {
  if (node.type !== 'table') {
    return [];
  }

  const table = node as TableNode;
  const prims: Primitive[] = [];

  for (const column of table.data.columns) {
    for (const side of ['left', 'right'] as const) {
      const point = columnPort(table, column.id, side);
      if (!point) continue;

      prims.push({
        t: 'circle',
        x: point.x,
        y: point.y,
        r: METRICS.portR,
        fill: side === 'right' ? palette.portSource : palette.portTarget,
        stroke: palette.portHalo,
        lw: 2,
      });
    }
  }

  return prims;
}

export function buildScene(input: SceneInput): Scene {
  const {
    nodes,
    edges,
    routes,
    viewport,
    size,
    palette,
    measurer,
    selectedNodeIds,
    selectedEdgeId,
    searchHighlights,
    hoveredNodeId,
    hoveredEdgeId,
    marquee,
    pendingConnection,
    showGrid = true,
  } = input;

  const world = visibleWorldRect(viewport, size);
  const visible = cullRect(world);
  const lod = lodForZoom(viewport.zoom);

  const groups: NodeDraw[] = [];
  const drawnNodes: NodeDraw[] = [];

  // Which edges belong to whatever is hovered — used to dim everything else,
  // which is the cheapest large readability win available on a dense diagram.
  const focusNodeId = hoveredNodeId ?? null;
  const focusedNodeIds = focusNodeId ? focusMembers(nodes, focusNodeId) : null;

  const focusedEdgeIds = new Set<string>();
  if (focusedNodeIds) {
    for (const edge of edges) {
      if (focusedNodeIds.has(edge.source.nodeId) || focusedNodeIds.has(edge.target.nodeId)) {
        focusedEdgeIds.add(edge.id);
      }
    }
  }

  for (const node of nodes) {
    const rect = nodeRect(node);
    if (!rectsIntersect(rect, visible)) continue;

    const highlight = searchHighlights?.get(node.id);

    let draw: NodeDraw;
    if (node.type === 'table') {
      draw = tableNodeDraw(node, { palette, measurer, lod, highlight });
    } else if (node.type === 'note') {
      draw = noteNodeDraw(node, { palette, measurer, lod });
    } else {
      draw = groupNodeDraw(node, { palette, measurer, lod });
    }

    const decorations: Primitive[] = [];
    if (selectedNodeIds.has(node.id)) decorations.push(selectionRing(rect, palette));
    // Ports only make sense when rows are actually distinguishable.
    if (node.id === hoveredNodeId && lod === 'full') decorations.push(...portPrims(node, palette));
    if (decorations.length > 0) draw.decorations = decorations;

    (node.type === 'group' ? groups : drawnNodes).push(draw);
  }

  // Painter's order within each band. The z lookup is a map rather than a
  // `find` inside the comparator, which made the sort quadratic in the node
  // count on every single frame.
  const zById = new Map(nodes.map((n) => [n.id, n.z]));
  groups.sort((a, b) => a.rect.y - b.rect.y);
  drawnNodes.sort((a, b) => (zById.get(a.id) ?? 0) - (zById.get(b.id) ?? 0));

  const drawnEdges: EdgeDraw[] = [];
  for (const edge of edges) {
    const route = routes.get(edge.id);
    if (!route || route.length < 2) continue;

    if (!routeIntersects(route, visible)) continue;

    const selected = edge.id === selectedEdgeId;
    const dimmed = focusNodeId !== null && !focusedEdgeIds.has(edge.id) && !selected;

    const drawn = drawEdge(edge, route, {
      palette,
      selected,
      dimmed,
      hovered: edge.id === hoveredEdgeId,
    });

    if (drawn.label && lod === 'full') {
      drawn.prims.push(
        ...edgeLabelPrims(
          drawn.label.text,
          drawn.label.at,
          palette,
          (s, f) => measurer.measure(s, f),
          edgeColor(edge, { palette, selected, dimmed })
        )
      );
    }

    drawnEdges.push(drawn);
  }

  // A selected edge is drawn last within its band so it is never buried.
  drawnEdges.sort((a, b) => Number(a.id === selectedEdgeId) - Number(b.id === selectedEdgeId));

  const overlays: Primitive[] = [];

  if (pendingConnection) {
    overlays.push({
      t: 'line',
      x1: pendingConnection.from.x,
      y1: pendingConnection.from.y,
      x2: pendingConnection.to.x,
      y2: pendingConnection.to.y,
      stroke: palette.selectionRing,
      lw: 2,
      dash: [5, 4],
    });
    overlays.push({
      t: 'circle',
      x: pendingConnection.to.x,
      y: pendingConnection.to.y,
      r: 4,
      fill: palette.selectionRing,
    });
  }

  if (marquee) {
    overlays.push({
      t: 'rect',
      x: marquee.x,
      y: marquee.y,
      w: marquee.w,
      h: marquee.h,
      fill: palette.marqueeFill,
      stroke: palette.marqueeStroke,
      lw: 1,
    });
  }

  // Grab handles for the selected edge: square at each end for re-anchoring,
  // round for each pinned bend. Only ever one edge's worth — handles on every
  // edge at once would bury a dense diagram.
  if (selectedEdgeId && lod === 'full') {
    const route = routes.get(selectedEdgeId);

    if (route && route.length >= 2) {
      for (const end of [route[0], route[route.length - 1]]) {
        overlays.push({
          t: 'rect',
          x: end.x - 4,
          y: end.y - 4,
          w: 8,
          h: 8,
          r: 2,
          fill: palette.card,
          stroke: palette.selectionRing,
          lw: 2,
        });
      }
    }

    for (const pin of input.selectedEdgeWaypoints ?? []) {
      overlays.push({
        t: 'circle',
        x: pin.x,
        y: pin.y,
        r: 4.5,
        fill: palette.selectionRing,
        stroke: palette.card,
        lw: 1.5,
      });
    }
  }

  if (input.movingEnd) {
    overlays.push({
      t: 'circle',
      x: input.movingEnd.point.x,
      y: input.movingEnd.point.y,
      r: 5,
      fill: palette.selectionRing,
      stroke: palette.card,
      lw: 2,
    });
  }

  return {
    world,
    // The grid stops being informative once cells fall below a few pixels.
    grid: showGrid && viewport.zoom > 0.3 ? { step: METRICS.gridSnap, color: palette.grid } : null,
    groups,
    edges: drawnEdges,
    nodes: drawnNodes,
    overlays,
  };
}

/**
 * The nodes whose relationships count as "focused" when `hoveredId` is hovered.
 *
 * For a table or a note, that is just itself. For a **group** it is everything
 * the group contains — a group owns no edges, so treating it like a table would
 * focus nothing and dim the entire diagram, which is the opposite of useful.
 *
 * Membership is geometric rather than by `parentId`: groups are drawn as regions
 * and a table is "in" one by sitting inside it, which is also how a user reads it.
 */
export function focusMembers(nodes: readonly DBNode[], hoveredId: string): Set<string> {
  const hovered = nodes.find((n) => n.id === hoveredId);
  if (!hovered) return new Set();
  if (hovered.type !== 'group') return new Set([hoveredId]);

  const bounds = nodeRect(hovered);
  const members = new Set<string>([hoveredId]);

  for (const node of nodes) {
    if (node.type === 'group' || node.id === hoveredId) continue;
    if (node.parentId === hoveredId || centerWithin(nodeRect(node), bounds)) {
      members.add(node.id);
    }
  }

  return members;
}

/** Containment by centre point, so a table overhanging an edge still counts. */
function centerWithin(inner: Rect, outer: Rect): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

/** Cheap bbox test so off-screen edges cost nothing to skip. */
function routeIntersects(route: Point[], rect: Rect): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of route) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return rectsIntersect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, rect);
}

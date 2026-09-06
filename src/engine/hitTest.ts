/**
 * What is under the pointer.
 *
 * A reverse-z linear scan, not a quadtree. At the scale this app targets (a few
 * hundred nodes) a linear pass is well under a tenth of a millisecond, and a tree
 * would need rebuilding on every drag frame. A spatial index earns its keep inside
 * the router, where obstacle queries run thousands of times per reroute — not here,
 * where we answer one query per pointer event.
 *
 * All tolerances are specified in **screen** pixels and converted to world units,
 * so a port stays as easy to grab at 40% zoom as at 100%.
 */
import {
  METRICS,
  inflate,
  nodeRect,
  pointInRect,
  tableRowAt,
  columnPort,
  type Point,
  type Rect,
  type Side,
} from './geometry';
import type { DBEdge, DBNode, TableNode } from '@/types';
import type { RouteMap } from './routing';
import { lodForZoom } from './scene';

export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

export type Hit =
  | { kind: 'port'; nodeId: string; columnId: string; side: Side; point: Point }
  | { kind: 'resize'; nodeId: string; corner: ResizeCorner }
  | { kind: 'row'; nodeId: string; columnId: string }
  | { kind: 'node'; nodeId: string }
  /** An end of the selected edge, draggable onto a different column. */
  | { kind: 'edgeEnd'; edgeId: string; which: 'source' | 'target'; point: Point }
  /** A pinned waypoint on the selected edge, draggable or removable. */
  | { kind: 'waypoint'; edgeId: string; index: number; point: Point }
  | { kind: 'edge'; edgeId: string };

export interface HitTestInput {
  nodes: readonly DBNode[];
  edges: readonly DBEdge[];
  routes: RouteMap;
  zoom: number;
  /** Only this node exposes ports and resize handles — the one under the pointer. */
  activeNodeId?: string | null;
  /** Resize handles are only offered for selected nodes. */
  selectedNodeIds?: ReadonlySet<string>;
  /**
   * The selected edge exposes drag handles: one at each end for re-anchoring,
   * one per pinned waypoint. Only for the selected edge — handles on every edge
   * at once would be unusable on a dense diagram.
   */
  selectedEdgeId?: string | null;
}

const EDGE_TOLERANCE_PX = 6;
const RESIZE_HANDLE_PX = 10;
const EDGE_HANDLE_PX = 9;

/** Squared distance from `p` to segment `a`-`b`. Squared to avoid a sqrt per segment. */
export function distanceToSegmentSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}

export function distanceToRoute(p: Point, route: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const d = distanceToSegmentSq(p, route[i - 1], route[i]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function cornerAt(rect: Rect, world: Point, tol: number): ResizeCorner | null {
  const near = (x: number, y: number) =>
    Math.abs(world.x - x) <= tol && Math.abs(world.y - y) <= tol;

  if (near(rect.x, rect.y)) return 'nw';
  if (near(rect.x + rect.w, rect.y)) return 'ne';
  if (near(rect.x + rect.w, rect.y + rect.h)) return 'se';
  if (near(rect.x, rect.y + rect.h)) return 'sw';
  return null;
}

/** Nearest column port on `node` within `tol` world units, if any. */
function portAt(node: DBNode, world: Point, tol: number): Hit | null {
  if (node.type !== 'table') return null;

  const table = node as TableNode;
  let best: { hit: Hit; d: number } | null = null;

  for (const column of table.data.columns) {
    for (const side of ['left', 'right'] as const) {
      const point = columnPort(table, column.id, side);
      if (!point) continue;

      const d = Math.hypot(point.x - world.x, point.y - world.y);
      if (d <= tol && (!best || d < best.d)) {
        best = { hit: { kind: 'port', nodeId: node.id, columnId: column.id, side, point }, d };
      }
    }
  }

  return best?.hit ?? null;
}

/**
 * Pick whatever is under `world`, in priority order.
 *
 * Ports and resize handles beat the node body they sit on, or they would be
 * impossible to grab. Nodes beat edges, since an edge passing under a table should
 * not steal the click.
 */
export function pick(world: Point, input: HitTestInput): Hit | null {
  const { nodes, edges, routes, zoom, activeNodeId, selectedNodeIds, selectedEdgeId } = input;
  const tol = (px: number) => px / zoom;
  const detailed = lodForZoom(zoom) === 'full';

  // The selected edge's handles beat everything, including the tables its ends
  // sit on — they are small, deliberate targets and there is only ever one set.
  if (selectedEdgeId) {
    const handle = pickEdgeHandle(world, selectedEdgeId, edges, routes, tol(EDGE_HANDLE_PX));
    if (handle) return handle;
  }

  // Reverse order: last drawn is topmost.
  const byZ = [...nodes].sort((a, b) => a.z - b.z);

  for (let i = byZ.length - 1; i >= 0; i--) {
    const node = byZ[i];
    const rect = nodeRect(node);

    // Ports stick out past the node edge, so test them slightly wide of the body.
    if (detailed && (node.id === activeNodeId || activeNodeId == null)) {
      const portTol = tol(METRICS.portHitR);
      if (pointInRect(world, inflate(rect, portTol))) {
        const port = portAt(node, world, portTol);
        if (port) return port;
      }
    }

    if (selectedNodeIds?.has(node.id)) {
      const corner = cornerAt(rect, world, tol(RESIZE_HANDLE_PX));
      if (corner) return { kind: 'resize', nodeId: node.id, corner };
    }

    if (!pointInRect(world, rect)) continue;

    // A group is a region: clicking inside it should reach the tables on top of
    // it, and only its own body if nothing else is there. The z-sort already
    // handles that, since groups sit at z 0.
    if (detailed && node.type === 'table') {
      const column = tableRowAt(node as TableNode, world);
      if (column) return { kind: 'row', nodeId: node.id, columnId: column.id };
    }

    return { kind: 'node', nodeId: node.id };
  }

  const edgeTol = tol(EDGE_TOLERANCE_PX);
  let closest: { edgeId: string; d: number } | null = null;

  for (const edge of edges) {
    const route = routes.get(edge.id);
    if (!route || route.length < 2) continue;

    const d = distanceToRoute(world, route);
    if (d <= edgeTol && (!closest || d < closest.d)) {
      closest = { edgeId: edge.id, d };
    }
  }

  return closest ? { kind: 'edge', edgeId: closest.edgeId } : null;
}

/** Endpoint and waypoint grab handles for the selected edge, nearest first. */
function pickEdgeHandle(
  world: Point,
  edgeId: string,
  edges: readonly DBEdge[],
  routes: RouteMap,
  tol: number
): Hit | null {
  const route = routes.get(edgeId);
  if (!route || route.length < 2) return null;

  const edge = edges.find((e) => e.id === edgeId);
  const near = (p: Point) => Math.hypot(p.x - world.x, p.y - world.y);

  let best: { hit: Hit; d: number } | null = null;
  const consider = (hit: Hit, point: Point) => {
    const d = near(point);
    if (d <= tol && (!best || d < best.d)) best = { hit, d };
  };

  // Waypoints first: a pinned point can sit close to an end, and moving the pin
  // is the more likely intent when the pointer is right on it.
  edge?.waypoints?.forEach((point, index) => {
    consider({ kind: 'waypoint', edgeId, index, point }, point);
  });

  consider({ kind: 'edgeEnd', edgeId, which: 'source', point: route[0] }, route[0]);
  const last = route[route.length - 1];
  consider({ kind: 'edgeEnd', edgeId, which: 'target', point: last }, last);

  return best ? (best as { hit: Hit }).hit : null;
}

/** Every node whose rect intersects the marquee. */
export function nodesInRect(nodes: readonly DBNode[], rect: Rect): string[] {
  const normalized = normalizeRect(rect);

  return nodes
    .filter((node) => {
      const r = nodeRect(node);
      return (
        r.x < normalized.x + normalized.w &&
        r.x + r.w > normalized.x &&
        r.y < normalized.y + normalized.h &&
        r.y + r.h > normalized.y
      );
    })
    .map((n) => n.id);
}

/** Turn a drag rect with negative extents into a positive one. */
export function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

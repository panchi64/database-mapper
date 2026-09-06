/**
 * Edge routing.
 *
 * One entry point, `routeEdges`, returning a path per edge. Behind it:
 *
 * 1. Resolve each end to a port and an outgoing direction (`endpoints.ts`).
 * 2. Step out perpendicular by `STUB`, so a line always leaves its column
 *    squarely and is never ambiguous about which row it belongs to.
 * 3. A* between the stub points, around every table and note (`astar.ts`).
 * 4. Fan overlapping runs into lanes (`lanes.ts`).
 *
 * Two escape hatches keep it inside a frame: nodes being dragged always take the
 * cheap elbow, and any search that blows its expansion budget falls back to one
 * too. A slightly ugly edge for a moment beats a dropped frame.
 */
import type { Point } from '../geometry';
import type { DBEdge, DBNode } from '@/types';
import { cheapRoute, simplify, STUB } from './cheap';
import { resolveEdge, sideNormal, type ResolvedEdge } from './endpoints';
import { findPath, DEFAULT_SEARCH, type SearchOptions } from './astar';
import { assignLanes, type RoutedEdge } from './lanes';
import { ObstacleIndex, obstaclesFor } from './obstacles';

export * from './cheap';
export * from './endpoints';
export * from './lanes';
export * from './obstacles';
export { findPath, DEFAULT_SEARCH } from './astar';

export type RouteMap = Map<string, Point[]>;

export interface RouteOptions {
  /**
   * Nodes currently being dragged. Their edges take the cheap path however good
   * the router is, because they are re-routed on every pointer move.
   */
  movingNodeIds?: ReadonlySet<string>;
  /** Skip the search entirely — used while dragging, panning or zooming. */
  fast?: boolean;
  search?: SearchOptions;
}

function stubPoint(point: Point, side: ResolvedEdge['source']['side']): Point {
  const n = sideNormal(side);
  return { x: point.x + n.x * STUB, y: point.y + n.y * STUB };
}

/**
 * Route one edge, honouring any waypoints the user has pinned.
 *
 * A pinned waypoint splits the route into legs, each searched independently, so
 * the router still avoids obstacles between the points the user cares about
 * rather than drawing straight lines through them.
 */
function routeOne(
  resolved: ResolvedEdge,
  waypoints: readonly Point[],
  index: ObstacleIndex,
  search: SearchOptions
): Point[] {
  const from = stubPoint(resolved.source.point, resolved.source.side);
  const to = stubPoint(resolved.target.point, resolved.target.side);

  const legs: Point[][] = [];
  let cursor = from;

  for (const stop of [...waypoints, to]) {
    const found = findPath(cursor, stop, index, search);
    if (!found) return cheapRoute(resolved);

    legs.push(found.path);
    cursor = stop;
  }

  const middle = legs.flat();

  return simplify([resolved.source.point, ...middle, resolved.target.point]);
}

/**
 * Re-route only the edges touching a node that is being dragged.
 *
 * Called every pointer-move, so it must be cheap *and* leave everything else
 * alone: re-running the full search each frame would cost tens of milliseconds,
 * and re-running the cheap router over every edge would make the whole diagram
 * visibly change shape while one table moves.
 */
export function routeMoving(
  edges: readonly DBEdge[],
  nodesById: ReadonlyMap<string, DBNode>,
  movingNodeIds: ReadonlySet<string>,
  base: RouteMap
): RouteMap {
  if (movingNodeIds.size === 0) return base;

  const routes = new Map(base);

  for (const edge of edges) {
    if (!movingNodeIds.has(edge.source.nodeId) && !movingNodeIds.has(edge.target.nodeId)) {
      continue;
    }

    const resolved = resolveEdge(edge, nodesById);
    if (resolved) routes.set(edge.id, cheapRoute(resolved));
    else routes.delete(edge.id);
  }

  return routes;
}

/**
 * A fingerprint of everything `routeEdges` actually reads.
 *
 * Routing 500 edges costs tens of milliseconds, and it was being re-run on *any*
 * store change — including every keystroke in a column name and every edge
 * label, colour or cardinality edit, none of which can move a line. Comparing
 * this instead skips the search unless the geometry really changed.
 *
 * Column ids are included because a reorder moves ports without changing any
 * node's rect.
 */
export function routingSignature(
  nodes: readonly DBNode[],
  edges: readonly DBEdge[]
): string {
  const parts: string[] = [];

  for (const n of nodes) {
    parts.push(
      `${n.id}:${n.x}:${n.y}:${n.w}:${n.h}:${
        n.type === 'table' ? n.data.columns.map((c) => c.id).join('.') : n.type
      }`
    );
  }

  parts.push('~');

  for (const e of edges) {
    const end = (r: { nodeId: string; columnId?: string; side?: string }) =>
      `${r.nodeId}.${r.columnId ?? ''}.${r.side ?? ''}`;
    parts.push(
      `${e.id}:${end(e.source)}>${end(e.target)}:${
        e.waypoints?.map((p) => `${p.x},${p.y}`).join(';') ?? ''
      }`
    );
  }

  return parts.join('|');
}

export function routeEdges(
  edges: readonly DBEdge[],
  nodesById: ReadonlyMap<string, DBNode>,
  options: RouteOptions = {}
): RouteMap {
  const { movingNodeIds, fast = false, search = DEFAULT_SEARCH } = options;

  const index = fast ? null : new ObstacleIndex(obstaclesFor([...nodesById.values()]));

  const routed: RoutedEdge[] = [];
  const routes: RouteMap = new Map();

  for (const edge of edges) {
    const resolved = resolveEdge(edge, nodesById);
    // A missing endpoint happens transiently during undo and import; skipping
    // just means the edge isn't drawn this frame.
    if (!resolved) continue;

    const moving =
      movingNodeIds?.has(edge.source.nodeId) || movingNodeIds?.has(edge.target.nodeId);

    if (fast || moving || !index) {
      routes.set(edge.id, cheapRoute(resolved));
      continue;
    }

    routed.push({
      id: edge.id,
      path: routeOne(resolved, edge.waypoints ?? [], index, search),
    });
  }

  // Lane separation only applies to properly routed edges; a cheap elbow during
  // a drag is transient and not worth spreading.
  for (const [id, path] of assignLanes(routed)) {
    routes.set(id, simplify(path));
  }

  return routes;
}

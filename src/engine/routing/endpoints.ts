/**
 * Deciding where an edge leaves and enters its nodes.
 *
 * Side selection is separate from path finding on purpose: the router needs to
 * know the two anchor points and their outgoing directions before it can search,
 * and the connect picker needs them without routing at all.
 */
import { columnPort, nodePort, nodeRect, type Point, type Rect, type Side } from '../geometry';
import type { DBEdge, DBNode, EndpointRef, TableNode } from '@/types';

export interface ResolvedEndpoint {
  point: Point;
  side: Side;
  nodeId: string;
  columnId?: string;
}

export interface ResolvedEdge {
  source: ResolvedEndpoint;
  target: ResolvedEndpoint;
}

/** Unit vector pointing out of a node from the given side. */
export function sideNormal(side: Side): Point {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

/**
 * Choose the pair of sides that gives the most direct path between two nodes.
 *
 * Horizontal is preferred: foreign keys read left-to-right, and a column's port
 * only exists on the left and right edges of its row, so a column-anchored end has
 * no meaningful top or bottom. Vertical is used only when the nodes are stacked
 * and neither end is pinned to a column.
 */
export function pickSides(
  from: Rect,
  to: Rect,
  opts: { sourceHasColumn: boolean; targetHasColumn: boolean } = {
    sourceHasColumn: false,
    targetHasColumn: false,
  }
): [Side, Side] {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);

  const columnAnchored = opts.sourceHasColumn || opts.targetHasColumn;

  // Clear horizontal separation, or a column endpoint that can only go sideways.
  const horizontallyApart = to.x > from.x + from.w || from.x > to.x + to.w;
  if (columnAnchored || horizontallyApart || Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }

  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function portFor(node: DBNode, ref: EndpointRef, side: Side): Point {
  if (ref.columnId && node.type === 'table') {
    const port = columnPort(node as TableNode, ref.columnId, side);
    if (port) return port;
  }
  return nodePort(node, side);
}

/**
 * Resolve both ends of an edge to concrete points and directions.
 *
 * Returns null when either node is missing, which the caller should treat as
 * "don't draw this edge" rather than an error — it happens transiently during
 * undo and import.
 */
export function resolveEdge(
  edge: DBEdge,
  nodesById: ReadonlyMap<string, DBNode>
): ResolvedEdge | null {
  const sourceNode = nodesById.get(edge.source.nodeId);
  const targetNode = nodesById.get(edge.target.nodeId);
  if (!sourceNode || !targetNode) return null;

  const [autoSource, autoTarget] = pickSides(nodeRect(sourceNode), nodeRect(targetNode), {
    sourceHasColumn: Boolean(edge.source.columnId),
    targetHasColumn: Boolean(edge.target.columnId),
  });

  // An explicitly pinned side wins; that only happens when the user dragged to a
  // particular edge of a node.
  const sourceSide = edge.source.side ?? autoSource;
  const targetSide = edge.target.side ?? autoTarget;

  return {
    source: {
      point: portFor(sourceNode, edge.source, sourceSide),
      side: sourceSide,
      nodeId: edge.source.nodeId,
      columnId: edge.source.columnId,
    },
    target: {
      point: portFor(targetNode, edge.target, targetSide),
      side: targetSide,
      nodeId: edge.target.nodeId,
      columnId: edge.target.columnId,
    },
  };
}

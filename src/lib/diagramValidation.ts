/**
 * Structural validation for diagram data, wherever it comes from.
 *
 * Shared by the file importer and by the localStorage rehydration path. Those two
 * used to disagree: files were validated per item, while saved state was cast
 * straight through — so a diagram that would be rejected as a `.json` was loaded
 * without a murmur from localStorage, and the renderer dereferenced whatever was
 * in it.
 *
 * Dropping something is never silent. `sanitizeDiagram` reports every removal,
 * and both callers surface it — the importer through its warnings list, the store
 * by keeping a backup of the original blob.
 */
import type { DBEdge, DBNode } from '@/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Rejects NaN and Infinity, which `typeof x === 'number'` happily allows. */
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validNode(value: unknown): value is DBNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;

  const { type, data } = value;
  if (type !== 'table' && type !== 'group' && type !== 'note') return false;
  if (!isRecord(data)) return false;

  // `node.type` and `node.data.type` are two spellings of the same fact, and the
  // code narrows on the first while reading fields off the second. A record where
  // they disagree passes a naive check and then crashes the renderer.
  if (data.type !== type) return false;
  if (type === 'table' && !Array.isArray(data.columns)) return false;

  // NaN or Infinity anywhere in the geometry poisons `diagramBounds` and
  // `fitView`, which leaves the canvas showing nothing at all.
  return finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h);
}

export function validEdge(value: unknown, nodeIds: ReadonlySet<string>): value is DBEdge {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;

  const { source, target } = value;
  if (!isRecord(source) || !isRecord(target)) return false;
  if (typeof source.nodeId !== 'string' || typeof target.nodeId !== 'string') return false;

  // An edge to a node that isn't present would render as a line to nowhere.
  return nodeIds.has(source.nodeId) && nodeIds.has(target.nodeId);
}

export interface SanitizeResult {
  nodes: DBNode[];
  edges: DBEdge[];
  /** One entry per kind of thing removed. Empty when the input was sound. */
  warnings: string[];
}

/**
 * Keep everything structurally sound and report what went.
 *
 * Edges are checked after nodes, against the nodes that survived — dropping a
 * node has to take its relationships with it, or they become dangling.
 */
export function sanitizeDiagram(rawNodes: unknown[], rawEdges: unknown[]): SanitizeResult {
  const warnings: string[] = [];

  const nodes = rawNodes.filter(validNode);
  if (nodes.length !== rawNodes.length) {
    warnings.push(`Skipped ${rawNodes.length - nodes.length} unreadable node(s).`);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = rawEdges.filter((e): e is DBEdge => validEdge(e, nodeIds));
  if (edges.length !== rawEdges.length) {
    warnings.push(`Skipped ${rawEdges.length - edges.length} unreadable relationship(s).`);
  }

  return { nodes, edges, warnings };
}

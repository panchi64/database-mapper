import { METRICS, intrinsicTableHeight } from '@/engine/geometry';
import type {
  Cardinality,
  Column,
  DBEdge,
  DBNode,
  DBNodeData,
  EndpointRef,
  Side,
  TableNodeData,
  Theme,
} from '@/types';

/**
 * The shape of everything we persist to localStorage.
 *
 * This mirrors `partialize` in the store: nodes, edges and theme only.
 * Selection, history and search state are deliberately transient.
 */
export interface PersistedShape {
  nodes: DBNode[];
  edges: DBEdge[];
  theme: Theme;
  /** UI preferences that outlive a session. Absent in anything before v3. */
  showOutline?: boolean;
}

/** Bump this whenever the persisted shape changes, and add a migration below. */
export const CURRENT_SCHEMA_VERSION = 3;

/** localStorage key holding a backup of state that failed to migrate. */
export const CORRUPT_BACKUP_KEY = 'db-mapper-storage-backup';

// --- Legacy (v0-v2) shapes --------------------------------------------------
// Everything up to v2 stored raw React Flow nodes and edges. These types describe
// that on-disk shape so the migrations can read it without `any`.

interface LegacyEdgeData {
  type?: string;
  cardinality?: Cardinality;
  label?: string;
  sourceColumn?: string;
  targetColumn?: string;
  isNoteLink?: boolean;
  color?: string;
  pattern?: string;
}

interface LegacyEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: LegacyEdgeData;
}

interface LegacyNode {
  id: string;
  type?: string;
  position?: { x?: number; y?: number };
  style?: { width?: number; height?: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  zIndex?: number;
  parentId?: string;
  data: DBNodeData;
}

export interface LegacyPersistedShape {
  nodes: LegacyNode[];
  edges: LegacyEdge[];
  theme: Theme;
  showOutline?: boolean;
}

// --- v0 -> v1 ---------------------------------------------------------------

/**
 * Add `isNoteLink` to every edge.
 *
 * Before v1, `RelationshipEdge` looked the source/target nodes up from the store on
 * every render to decide whether it was a note link. That read raced with node
 * updates during drag and selection, so edges would randomly vanish. The flag is
 * now computed once, at edge creation, and stored on the edge.
 */
export function migrateV0toV1(state: LegacyPersistedShape): LegacyPersistedShape {
  const edges = state.edges.map((edge) => {
    // Defensive: v0 shouldn't have the field, but never clobber it if present.
    if (edge.data?.isNoteLink !== undefined) return edge;

    const sourceNode = state.nodes.find((n) => n.id === edge.source);
    const targetNode = state.nodes.find((n) => n.id === edge.target);
    const isNoteLink =
      sourceNode?.data.type === 'note' || targetNode?.data.type === 'note';

    return { ...edge, data: { ...edge.data, isNoteLink } };
  });

  return { ...state, edges };
}

// --- v1 -> v2 ---------------------------------------------------------------

/**
 * Give note links an explicit `pattern`.
 *
 * v1 hard-coded a dashed stroke for note links. v2 made the pattern user-editable,
 * so existing note links need the default written down to keep looking the same.
 */
export function migrateV1toV2(state: LegacyPersistedShape): LegacyPersistedShape {
  const edges = state.edges.map((edge) => {
    if (edge.data?.pattern !== undefined) return edge;
    if (edge.data?.isNoteLink !== true) return edge; // table relationships stay solid

    return { ...edge, data: { ...edge.data, pattern: 'dashed' } };
  });

  return { ...state, edges };
}

// --- v2 -> v3 ---------------------------------------------------------------

/**
 * Parse a React Flow handle id back into a structured endpoint.
 *
 * v2 encoded the column into the handle string: `"<columnId>-right"` for a source,
 * `"<columnId>-left"` for a target, plus the bare node-level ids `"top"`/`"bottom"`.
 *
 * Exported because the file importer still needs it — a `.json` exported by an old
 * build carries these strings, and we keep reading those forever.
 */
export function parseLegacyHandle(handle: string | null | undefined): {
  columnId?: string;
  side?: Side;
} {
  if (!handle) return {};
  if (handle === 'top' || handle === 'bottom') return { side: handle };

  const match = /^(.+)-(left|right)$/.exec(handle);
  if (!match) return {};

  return { columnId: match[1], side: match[2] as Side };
}

function defaultSize(type: string): { w: number; h: number } {
  if (type === 'group') return { w: METRICS.groupDefaultW, h: METRICS.groupDefaultH };
  if (type === 'note') return { w: METRICS.noteDefaultW, h: METRICS.noteDefaultH };
  return { w: METRICS.defaultW, h: 200 };
}

function defaultZ(type: string): number {
  if (type === 'group') return 0;
  if (type === 'note') return 2;
  return 1;
}

/**
 * Convert a stored React Flow node into our own flat geometry.
 *
 * Every React Flow runtime field — `measured`, `dragging`, `positionAbsolute`,
 * `selected`, `handles`, `extent`, `style` — is dropped rather than carried
 * forward. They were incidental to the old renderer and several of them (notably
 * `selected`) should never have been persisted in the first place.
 */
function migrateNode(node: LegacyNode): DBNode {
  const type = (node.type ?? node.data.type ?? 'table') as DBNode['type'];
  const fallback = defaultSize(type);

  const w = node.style?.width ?? node.measured?.width ?? node.width ?? fallback.w;
  const base = {
    id: node.id,
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    w,
    z: node.zIndex ?? defaultZ(type),
    ...(node.parentId ? { parentId: node.parentId } : {}),
  };

  if (type === 'table') {
    const data = node.data as TableNodeData;
    // Height is derived from the column count now, not whatever the DOM measured.
    return { ...base, type: 'table', data, h: intrinsicTableHeight(data) };
  }

  const h = node.style?.height ?? node.measured?.height ?? node.height ?? fallback.h;
  return type === 'group'
    ? { ...base, type: 'group', data: node.data as DBNode['data'] & { type: 'group' }, h }
    : { ...base, type: 'note', data: node.data as DBNode['data'] & { type: 'note' }, h };
}

function migrateEdge(edge: LegacyEdge): DBEdge {
  const fromHandle = parseLegacyHandle(edge.sourceHandle);
  const toHandle = parseLegacyHandle(edge.targetHandle);

  const source: EndpointRef = {
    nodeId: edge.source,
    // Handles are the better source of truth, but very old edges only recorded
    // the column in `data`, so fall back to that.
    ...(fromHandle.columnId ?? edge.data?.sourceColumn
      ? { columnId: fromHandle.columnId ?? edge.data?.sourceColumn }
      : {}),
    ...(fromHandle.side ? { side: fromHandle.side } : {}),
  };

  const target: EndpointRef = {
    nodeId: edge.target,
    ...(toHandle.columnId ?? edge.data?.targetColumn
      ? { columnId: toHandle.columnId ?? edge.data?.targetColumn }
      : {}),
    ...(toHandle.side ? { side: toHandle.side } : {}),
  };

  return {
    id: edge.id,
    source,
    target,
    data: {
      type: 'relationship',
      cardinality: edge.data?.cardinality,
      label: edge.data?.label,
      isNoteLink: edge.data?.isNoteLink,
      color: edge.data?.color as DBEdge['data']['color'],
      pattern: edge.data?.pattern as DBEdge['data']['pattern'],
    },
  };
}

/**
 * Write each relationship back onto its source column as a `foreignKey`.
 *
 * `Column.foreignKey` has existed in the types since the beginning and `TableNode`
 * renders an FK badge from it, but nothing ever wrote it — so the badge never
 * appeared. The edges already hold the information, so the migration can simply
 * derive it. From v3 on the store keeps it in sync as edges change.
 */
function backfillForeignKeys(nodes: DBNode[], edges: DBEdge[]): DBNode[] {
  // columnId -> what it references
  const fks = new Map<string, { tableId: string; columnId: string }>();

  for (const edge of edges) {
    if (edge.data.isNoteLink) continue;
    const { columnId } = edge.source;
    const targetColumn = edge.target.columnId;
    if (!columnId || !targetColumn) continue;

    fks.set(columnId, { tableId: edge.target.nodeId, columnId: targetColumn });
  }

  if (fks.size === 0) return nodes;

  return nodes.map((node) => {
    if (node.type !== 'table') return node;

    let changed = false;
    const columns = node.data.columns.map((column: Column) => {
      const fk = fks.get(column.id);
      if (!fk || column.foreignKey) return column;
      changed = true;
      return { ...column, foreignKey: fk };
    });

    return changed ? { ...node, data: { ...node.data, columns } } : node;
  });
}

/**
 * Replace React Flow's node/edge shape with our own.
 *
 * Nodes gain flat `x/y/w/h`; edges gain structured `source`/`target` endpoints in
 * place of the `source` + `sourceHandle` string pair. See `migrateNode`,
 * `migrateEdge` and `backfillForeignKeys` for the detail.
 */
export function migrateV2toV3(state: LegacyPersistedShape): PersistedShape {
  const nodes = state.nodes.map(migrateNode);
  const edges = state.edges.map(migrateEdge);

  return {
    nodes: backfillForeignKeys(nodes, edges),
    edges,
    theme: state.theme,
    ...(state.showOutline === undefined ? {} : { showOutline: state.showOutline }),
  };
}

// --- Runner -----------------------------------------------------------------

/**
 * Apply every migration needed to bring `persisted` up to CURRENT_SCHEMA_VERSION.
 *
 * Migrations are *cumulative*, not exclusive: state saved at v0 runs through
 * v0->v1, v1->v2 and v2->v3 in turn. An earlier version of this used
 * `if (version === n)` with an early return, which meant v0 data was upgraded to
 * v1 and handed back still missing every later change.
 */
export function runMigrations(persisted: LegacyPersistedShape, version: number): PersistedShape {
  let legacy = persisted;
  if (version < 1) legacy = migrateV0toV1(legacy);
  if (version < 2) legacy = migrateV1toV2(legacy);

  // v3 changes the shape itself, so it is the terminal step rather than another
  // link in the legacy chain.
  if (version < 3) return migrateV2toV3(legacy);

  return legacy as unknown as PersistedShape;
}

/**
 * Narrow an unknown blob from localStorage to something the migrations can chew on.
 * Throws when it clearly isn't ours, so the caller can take the backup path.
 */
export function assertPersistedShape(value: unknown): LegacyPersistedShape {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Persisted state is not an object');
  }

  const candidate = value as Partial<LegacyPersistedShape>;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    throw new Error('Persisted state is missing nodes/edges arrays');
  }

  return {
    nodes: candidate.nodes,
    edges: candidate.edges,
    theme: candidate.theme ?? 'system',
    ...(candidate.showOutline === undefined ? {} : { showOutline: candidate.showOutline }),
  };
}

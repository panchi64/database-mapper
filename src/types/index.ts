// Column data types for SQL databases
export type ColumnDataType =
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  | 'DECIMAL' | 'NUMERIC' | 'FLOAT' | 'DOUBLE'
  | 'VARCHAR' | 'CHAR' | 'TEXT' | 'LONGTEXT'
  | 'DATE' | 'DATETIME' | 'TIMESTAMP' | 'TIME'
  | 'BOOLEAN' | 'BIT'
  | 'BLOB' | 'BINARY' | 'VARBINARY'
  | 'JSON' | 'UUID'
  | 'ENUM' | 'SET';

// Cardinality types for relationships
export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

/** Which edge of a node an edge endpoint attaches to. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

// Column definition
export interface Column {
  id: string;
  name: string;
  dataType: ColumnDataType;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
  /**
   * Derived from the relationship edges, not authored directly. The store keeps
   * this in sync whenever an edge is created, rewired or deleted; it exists so a
   * table can render its FK badges without walking the edge list.
   */
  foreignKey?: {
    tableId: string;
    columnId: string;
  };
}

// Table node data
export interface TableNodeData {
  type: 'table';
  name: string;
  columns: Column[];
  color?: string;
  comment?: string;
}

// Group node data (for grouping tables)
export interface GroupNodeData {
  type: 'group';
  name: string;
  color?: string;
}

// Note/Comment node data
export interface NoteNodeData {
  type: 'note';
  name: string;
  content: string;
  color?: string;
}

// Union type for all node data
export type DBNodeData = TableNodeData | GroupNodeData | NoteNodeData;

export type NodeKind = 'table' | 'group' | 'note';

/**
 * A node on the canvas.
 *
 * Geometry is stored flat and explicitly. Under React Flow this was spread across
 * `position`, `style.width/height` and a `measured` field the library wrote after
 * layout, which meant a node's real size was only knowable after it had been
 * rendered. Here `x/y/w/h` are always populated and always authoritative, so
 * routing, hit-testing and layout can run without a DOM.
 */
export interface BaseNode<K extends NodeKind, D> {
  id: string;
  type: K;
  data: D;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Paint order: groups 0, tables 1, notes 2. */
  z: number;
  /** Group containment. */
  parentId?: string;
}

export type TableNode = BaseNode<'table', TableNodeData>;
export type GroupNode = BaseNode<'group', GroupNodeData>;
export type NoteNode = BaseNode<'note', NoteNodeData>;
export type DBNode = TableNode | GroupNode | NoteNode;

/**
 * One end of a relationship.
 *
 * Replaces React Flow's `source`/`sourceHandle` string pair, where the column was
 * encoded into a handle id like `"<columnId>-right"` and had to be parsed back out.
 *
 * `columnId` absent means the edge attaches to the node as a whole (notes, and
 * table-level links). `side` absent means the router picks the side that produces
 * the best path — which is the normal case; it is only pinned when the user
 * explicitly drags to a particular side.
 */
export interface EndpointRef {
  nodeId: string;
  columnId?: string;
  side?: Side;
}

// Edge/Relationship data
export interface RelationshipEdgeData {
  type: 'relationship';
  cardinality?: Cardinality;
  label?: string;
  /** Cached at creation: looking this up per-render used to race with node updates. */
  isNoteLink?: boolean;
  color?: 'slate' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
  pattern?: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
}

export interface DBEdge {
  id: string;
  source: EndpointRef;
  target: EndpointRef;
  /**
   * Points the route must pass through, pinned by dragging the line.
   *
   * The router still avoids obstacles *between* them, so a nudged edge stays
   * sensible when tables move — unlike a fully manual path, which goes stale the
   * moment anything shifts.
   */
  waypoints?: { x: number; y: number }[];
  data: RelationshipEdgeData;
}

/**
 * Serialised diagram, as written to a `.json` file.
 *
 * Deliberately no viewport: the camera lives in `ViewportController`, outside
 * React and outside the store, so nothing here could populate it. The field
 * existed and was never once written — restoring the camera on load would mean
 * plumbing it through `CanvasApi`, which is a feature rather than a format
 * detail.
 */
export interface DiagramState {
  nodes: DBNode[];
  edges: DBEdge[];
}

// History entry for undo/redo
export interface HistoryEntry {
  nodes: DBNode[];
  edges: DBEdge[];
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';

// SQL data types array for UI selects
export const SQL_DATA_TYPES: ColumnDataType[] = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE',
  'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
  'BOOLEAN', 'BIT',
  'BLOB', 'BINARY', 'VARBINARY',
  'JSON', 'UUID',
  'ENUM', 'SET'
];

// Preset colors for nodes
export const PRESET_COLORS = [
  { name: 'slate', value: '#64748b' },
  { name: 'red', value: '#ef4444' },
  { name: 'orange', value: '#f97316' },
  { name: 'yellow', value: '#eab308' },
  { name: 'green', value: '#22c55e' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'purple', value: '#a855f7' },
  { name: 'pink', value: '#ec4899' },
] as const;

// Clipboard data format for copy/paste
export interface ClipboardData {
  type: 'db-mapper-nodes';
  version: '1.0';
  nodes: DBNode[];
}

// Search filter types
export type SearchFilter = 'all' | 'tables' | 'columns';

// Search result type
export interface SearchResult {
  nodeId: string;
  tableName: string;
  matchType: 'table' | 'column';
  columnName?: string;
  columnId?: string;
}

// Search highlight info for a node
export interface SearchHighlight {
  tableNameMatch: boolean;
  matchingColumnIds: string[];
}

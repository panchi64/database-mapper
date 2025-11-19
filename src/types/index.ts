import { Node, Edge } from '@xyflow/react';

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
  [key: string]: unknown;
}

// Group node data (for grouping tables)
export interface GroupNodeData {
  type: 'group';
  name: string;
  color?: string;
  [key: string]: unknown;
}

// Note/Comment node data
export interface NoteNodeData {
  type: 'note';
  name: string;
  content: string;
  color?: string;
  [key: string]: unknown;
}

// Union type for all node data
export type DBNodeData = TableNodeData | GroupNodeData | NoteNodeData;

// Typed nodes
export type TableNode = Node<TableNodeData, 'table'>;
export type GroupNode = Node<GroupNodeData, 'group'>;
export type NoteNode = Node<NoteNodeData, 'note'>;
export type DBNode = TableNode | GroupNode | NoteNode;

// Edge/Relationship data
export interface RelationshipEdgeData {
  type: 'relationship';
  cardinality?: Cardinality;
  label?: string;
  sourceColumn?: string;
  targetColumn?: string;
  [key: string]: unknown;
}

export type DBEdge = Edge<RelationshipEdgeData>;

// Application state for save/load
export interface DiagramState {
  nodes: DBNode[];
  edges: DBEdge[];
  viewport?: { x: number; y: number; zoom: number };
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

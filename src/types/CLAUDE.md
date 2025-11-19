# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Type Definitions

This directory contains all TypeScript type definitions for the application's data structures.

### Core Types

**Column Data Types**:
```typescript
type ColumnDataType =
  // Integer types
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  // Decimal types
  | 'DECIMAL' | 'NUMERIC' | 'FLOAT' | 'DOUBLE'
  // String types
  | 'VARCHAR' | 'CHAR' | 'TEXT' | 'LONGTEXT'
  // Date/Time types
  | 'DATE' | 'DATETIME' | 'TIMESTAMP' | 'TIME'
  // Boolean types
  | 'BOOLEAN' | 'BIT'
  // Binary types
  | 'BLOB' | 'BINARY' | 'VARBINARY'
  // Special types
  | 'JSON' | 'UUID' | 'ENUM' | 'SET'
```

**Column Interface**:
```typescript
interface Column {
  id: string;
  name: string;
  dataType: ColumnDataType;
  length?: number;           // For VARCHAR, CHAR, DECIMAL, etc.
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
  foreignKey?: { tableId: string; columnId: string };
}
```

### Node Data Types

Each node type has a discriminated union based on `type` field:

- **TableNodeData**: `{ type: 'table', name, columns[], color?, comment? }`
- **GroupNodeData**: `{ type: 'group', name, color? }`
- **NoteNodeData**: `{ type: 'note', name, content, color? }`

Nodes extend React Flow's `Node` type with specific data:
```typescript
type TableNode = Node<TableNodeData, 'table'>
type GroupNode = Node<GroupNodeData, 'group'>
type NoteNode = Node<NoteNodeData, 'note'>
type DBNode = TableNode | GroupNode | NoteNode
```

### Edge Types

**Cardinality**: `'one-to-one' | 'one-to-many' | 'many-to-many'`

**RelationshipEdgeData**:
```typescript
{
  type: 'relationship';
  cardinality?: Cardinality;
  label?: string;
  sourceColumn?: string;   // Column ID
  targetColumn?: string;   // Column ID
}
```

### Clipboard Types

**ClipboardData** (for copy-paste validation):
```typescript
{
  type: 'db-mapper-nodes';  // Type identifier for validation
  version: '1.0';           // Format version for compatibility
  nodes: DBNode[];          // Array of copied nodes
}
```

### Application State Types

**DiagramState** (for export/import):
```typescript
{
  nodes: DBNode[];
  edges: DBEdge[];
  viewport?: { x: number; y: number; zoom: number };
}
```

**HistoryEntry** (for undo/redo):
```typescript
{
  nodes: DBNode[];
  edges: DBEdge[];
}
```

### Preset Colors

8 colors with hex values:
```typescript
const PRESET_COLORS = [
  { name: 'slate', value: '#64748b' },
  { name: 'red', value: '#ef4444' },
  { name: 'orange', value: '#f97316' },
  { name: 'yellow', value: '#eab308' },
  { name: 'green', value: '#22c55e' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'purple', value: '#a855f7' },
  { name: 'pink', value: '#ec4899' },
]
```

### Type Guards

When working with nodes, use type narrowing:
```typescript
if (node.data.type === 'table') {
  // node.data is TableNodeData
  node.data.columns  // accessible
}
```

### Adding New Types

When adding new column data types:
1. Add to `ColumnDataType` union
2. Update `SQL_DATA_TYPES` array in ColumnEditor
3. Update length field visibility logic if type needs length parameter

When adding new node types:
1. Create data interface with `type` discriminator
2. Add to `DBNode` union
3. Create component in `components/nodes/`
4. Register in nodeTypes object
5. Add to store actions if needed

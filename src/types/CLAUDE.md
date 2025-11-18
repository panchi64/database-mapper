# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Type Definitions

This directory contains all TypeScript type definitions for the application's data structures.

### Core Types

**Column Types**:
```typescript
type ColumnDataType =
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  | 'DECIMAL' | 'FLOAT' | 'DOUBLE'
  | 'VARCHAR' | 'CHAR' | 'TEXT' | 'LONGTEXT'
  | 'DATE' | 'DATETIME' | 'TIMESTAMP' | 'TIME'
  | 'BOOLEAN' | 'JSON' | 'UUID' | 'BLOB'
```

**Column Interface**:
```typescript
interface Column {
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
  foreignKey?: { tableId: string; columnId: string };
}
```

### Node Data Types

Each node type has a discriminated union based on `type` field:

- **TableNodeData**: `{ type: 'table', name, columns, color?, comment? }`
- **GroupNodeData**: `{ type: 'group', name, color?, collapsed? }`
- **NoteNodeData**: `{ type: 'note', content, color? }`

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
  sourceColumn?: string;
  targetColumn?: string;
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

### Type Guards

When working with nodes, use type narrowing:
```typescript
if (node.data.type === 'table') {
  // node.data is TableNodeData
}
```

### Adding New Types

When adding new column data types:
1. Add to `ColumnDataType` union
2. Update any type-specific logic in ColumnEditor component

When adding new node types:
1. Create data interface with `type` discriminator
2. Add to `DBNode` union
3. Create component in `components/nodes/`
4. Register in node types export

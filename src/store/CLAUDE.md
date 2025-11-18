# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## State Management

This directory contains the Zustand store that manages all application state with localStorage persistence.

### Store Structure

**useStore.ts** exports a single Zustand store with the following state shape:

```typescript
{
  // Diagram data
  nodes: DBNode[]
  edges: DBEdge[]

  // Selection
  selectedId: string | null

  // History (undo/redo)
  history: HistoryEntry[]
  historyIndex: number

  // Theme
  theme: 'light' | 'dark' | 'system'
}
```

### Persistence

Store automatically persists to localStorage with key `db-mapper-storage`. Uses Zustand's `persist` middleware with partialize to exclude `selectedId` from storage.

### Action Categories

**Node Management**:
- `addNode(node)`: Add new node with history snapshot
- `updateNode(id, data)`: Update node properties
- `deleteNode(id)`: Remove node and connected edges
- `setNodes(nodes)`: Replace all nodes (batch operation)

**Edge Management**:
- `addEdge(edge)`: Add new relationship
- `updateEdge(id, data)`: Update edge properties
- `updateEdgeCardinality(id, cardinality)`: Change relationship type
- `deleteEdge(id)`: Remove edge
- `setEdges(edges)`: Replace all edges

**Column Management** (for TableNodes):
- `addColumn(nodeId)`: Add new column to table
- `updateColumn(nodeId, columnId, data)`: Update column properties
- `deleteColumn(nodeId, columnId)`: Remove column
- `reorderColumns(nodeId, columnIds)`: Change column order

**Group Management** (for GroupNodes):
- `updateGroupName(nodeId, name)`: Rename group
- `updateGroupColor(nodeId, color)`: Change group color
- `toggleGroupCollapse(nodeId)`: Expand/collapse group

**Note Management** (for NoteNodes):
- `updateNoteContent(nodeId, content)`: Update note text
- `updateNoteColor(nodeId, color)`: Change note color

**Selection**:
- `selectNode(id)` / `selectEdge(id)`: Set selected element
- `clearSelection()`: Deselect all

**History**:
- `undo()` / `redo()`: Navigate history
- History limited to 50 entries for memory management
- Deep copy via JSON stringify/parse for immutability

**File Operations**:
- `exportDiagram()`: Get serializable diagram state
- `importDiagram(data)`: Load diagram from JSON

### Usage Patterns

**Access state with selectors** (prevents unnecessary re-renders):
```typescript
const nodes = useStore((state) => state.nodes);
const selectedId = useStore((state) => state.selectedId);
```

**Multiple selectors in one component**:
```typescript
const { nodes, edges, addNode, deleteNode } = useStore();
```

**History snapshots**: Most mutating actions call internal `pushHistory()` before modification to enable undo.

### Important Implementation Details

- All ID generation uses `uuid` library
- History uses deep copy (JSON parse/stringify) - be aware of performance with large diagrams
- Edge deletion cascades when deleting nodes (removes connected edges)
- Column foreign keys reference by `tableId` and `columnId`

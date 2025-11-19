# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## State Management

This directory contains the Zustand store that manages all application state with localStorage persistence.

### Store Structure

**useStore.ts** exports a single Zustand store with the following state shape:

```typescript
{
  // Diagram data (persisted)
  nodes: DBNode[]
  edges: DBEdge[]
  theme: 'light' | 'dark' | 'system'

  // Selection (not persisted)
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // History (not persisted)
  history: HistoryEntry[]
  historyIndex: number
}
```

### Persistence

Store persists to localStorage with key `db-mapper-storage`. Uses Zustand's `persist` middleware with `partialize`:

```typescript
partialize: (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  theme: state.theme,
})
```

Selection and history reset on page reload - only diagram data survives.

### Action Categories

**React Flow Integration**:
- `onNodesChange(changes)`: Apply React Flow position/visibility changes
- `onEdgesChange(changes)`: Apply React Flow edge changes
- `onConnect(connection)`: Create edge when user connects nodes (auto-generates UUID)

**Node Management**:
- `addTable(position)`, `addGroup(position)`, `addNote(position)`: Create nodes, return ID
- `updateTableName(id, name)`, `updateTableColor(id, color)`, `updateTableComment(id, comment)`
- `updateGroupName(id, name)`, `updateGroupColor(id, color)`
- `updateNoteContent(id, content)`, `updateNoteName(id, name)`, `updateNoteColor(id, color)`
- `deleteNode(id)`: Remove node AND cascade-delete connected edges

**Column Management**:
- `addColumn(nodeId)`: Add column with default VARCHAR(255)
- `updateColumn(nodeId, columnId, data)`: Partial update column properties
- `deleteColumn(nodeId, columnId)`: Remove column
- `reorderColumns(nodeId, columnIds)`: Reorder via ID array

**Edge Management**:
- `updateEdgeCardinality(id, cardinality)`: Change relationship type
- `updateEdgeLabel(id, label)`: Set edge display label
- `updateEdgeColumns(id, sourceColumn, targetColumn)`: Map columns AND update handles

**Selection** (mutually exclusive):
- `setSelectedNode(id)`: Select node, clear edge selection
- `setSelectedEdge(id)`: Select edge, clear node selection
- `clearSelection()`: Deselect all

**History**:
- `saveToHistory()`: Snapshot current state before mutation
- `undo()` / `redo()`: Navigate history with bounds checking
- `canUndo()` / `canRedo()`: Query methods for UI state
- Limited to 50 entries (MAX_HISTORY constant)

**File Operations**:
- `exportDiagram()`: Return `{ nodes, edges }` for JSON export
- `importDiagram(data)`: Load diagram, save to history
- `clearDiagram()`: Reset to empty state

**Clipboard**:
- `copySelectedNodes()`: Copy nodes with `node.selected` flag to navigator.clipboard
- `pasteNodes(position)`: Paste with ID regeneration at specified position

### Usage Patterns

**Selector pattern** (minimizes re-renders):
```typescript
const nodes = useStore((state) => state.nodes);
const selectedNode = useStore((state) =>
  state.nodes.find(n => n.id === state.selectedNodeId)
);
```

**Multiple related properties** (use useShallow):
```typescript
const { nodes, edges } = useStore(useShallow((state) => ({
  nodes: state.nodes,
  edges: state.edges
})));
```

**Action access**:
```typescript
const updateTableName = useStore((state) => state.updateTableName);
```

**History pattern**: Most actions save history BEFORE mutation:
```typescript
updateTableName: (nodeId, name) => {
  get().saveToHistory();  // Snapshot before change
  set({ /* update nodes */ });
}
```

### Important Implementation Details

- **ID generation**: Uses `uuid` library for all IDs
- **Deep copy**: History uses `structuredClone()` (better than JSON for circular refs)
- **Cascade deletion**: `deleteNode` also removes connected edges
- **Handle updates**: `updateEdgeColumns` also updates `sourceHandle`/`targetHandle`:
  ```typescript
  sourceHandle: sourceColumn ? `${sourceColumn}-right` : edge.sourceHandle
  ```
- **Clipboard validation**: Uses `ClipboardData` type with `type: 'db-mapper-nodes'` marker
- **Paste behavior**: Regenerates all IDs, clears foreignKey references, adds "(copy)" suffix

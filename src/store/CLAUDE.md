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

  // Selection (not persisted, and never stored on the nodes themselves)
  selectedNodeId: string | null    // the one the properties panel edits
  selectedEdgeId: string | null
  selectedNodeIds: Set<string>     // marquee / multi-drag / copy

  // History (not persisted)
  past: HistoryEntry[]
  future: HistoryEntry[]
}
```

### Files

- `useStore.ts` — the store itself: state, actions, persist wiring
- `migrations.ts` — pure, chaining schema migrations (see `docs/MIGRATIONS.md`)
- `migrations.test.ts` / `useStore.test.ts` — Vitest suites (`bun run test`)

### Persistence

Store persists to localStorage with key `db-mapper-storage`. Uses Zustand's `persist` middleware with `partialize`:

```typescript
partialize: (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  theme: state.theme,
  showOutline: state.showOutline,
})
```

Selection and history reset on page reload - only diagram data survives.

### Action Categories

**Geometry** (the canvas engine commits drags and resizes through these):
- `moveNodes(ids, delta)`: Offset nodes as one undoable step, once a drag ends
- `resizeNode(id, rect)`: Resize, clamped by `nodeSizeLimits`. A table takes the width only — its height stays derived, so `y` is left alone too
- `arrange(kind, onlySelected?)`: Re-position with the auto-layout as one undoable step

**Node Management**:
- `addTable(position)`, `addGroup(position)`, `addNote(position)`: Create nodes, return ID
- `updateTableName(id, name)`, `updateTableColor(id, color)`, `updateTableComment(id, comment)`
- `updateGroupName(id, name)`, `updateGroupColor(id, color)`
- `updateNoteContent(id, content)`, `updateNoteName(id, name)`, `updateNoteColor(id, color)`
- `deleteNode(id)` / `deleteNodes(ids)`: Remove nodes AND cascade-delete every
  connected edge, as a single undoable step

**Column Management**:
- `addColumn(nodeId)`: Add column with default VARCHAR(255)
- `updateColumn(nodeId, columnId, data)`: Partial update column properties
- `deleteColumn(nodeId, columnId)`: Remove column
- `reorderColumns(nodeId, columnIds)`: Reorder via ID array

**Edge Management**:
- `createRelationship({ source, target, cardinality?, label? })`: the one way edges are created. Rejects unknown nodes, a column pointing at itself, and duplicates of an existing endpoint pair; returns the new edge id or `null`. Both the connect picker and the drag bridge go through it.
- `setEdgeEndpoint(id, 'source' | 'target', ref)`: re-anchor one end
- `updateEdgeColumns(id, sourceColumn, targetColumn)`: set both columns at once (the properties panel edits them together)
- `updateEdgeCardinality(id, cardinality)`: Change relationship type
- `updateEdgeLabel(id, label)`: Set edge display label

**Selection** (node and edge selection are mutually exclusive):
- `setSelectedNode(id)`: Select one node, clear edge selection
- `setSelectedNodes(ids)`: Select several. `selectedNodeId` follows a *single*
  selection and goes null for a multi-selection, because the properties panel
  only edits one node at a time
- `selectNode(id, additive?)`: Select one, or toggle it into the current set
- `setSelectedEdge(id)`: Select edge, clear node selection
- `clearSelection()`: Deselect all
- `deleteSelected()`: **Reads `selectedNodeIds`, not `selectedNodeId`.** Keying
  off the singular id made Delete a no-op for every multi-selection

**History** (past/future stacks around the live document):
- `past: HistoryEntry[]` — states we can go back to; `future: HistoryEntry[]` — states we can go forward to. The store itself holds the present.
- `saveToHistory()`: push the current document onto `past` and clear `future`. Call it *before* mutating.
- `undo()`: move the present onto `future`, pop `past` into the present. `redo()` is the mirror.
- `canUndo()` / `canRedo()`: `past.length > 0` / `future.length > 0`
- `past` is capped at 50 entries (MAX_HISTORY); oldest fall off the back.

**File Operations**:
- `exportDiagram()`: Return `{ nodes, edges }` for JSON export
- `importDiagram(data)`: Load diagram, save to history
- `clearDiagram()`: Reset to empty state

**Clipboard**:
- `copySelectedNodes()`: Copy every node in `selectedNodeIds` to navigator.clipboard
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
  get().saveToHistory();  // Push the current document onto `past`
  set({ /* update nodes */ });
}
```

### Important Implementation Details

- **ID generation**: Uses `uuid` library for all IDs
- **Deep copy**: History uses `structuredClone()` (better than JSON for circular refs)
- **Cascade deletion**: `deleteNodes` drops every edge with an end in the deleted set; `deleteColumn` drops every edge anchored to that column (`touchesColumn`)
- **Derived foreign keys**: `syncForeignKeys(nodes, edges)` rewrites every `Column.foreignKey` from the edge list. Call it after *any* change to edge endpoints — edges are the source of truth, `foreignKey` is the cache
- **Table auto-sizing**: `resized(node)` re-derives a table's height from its columns. Call it after anything touching the column list or the comment
- **Clipboard validation**: Uses `ClipboardData` type with `type: 'db-mapper-nodes'` marker
- **Paste behavior**: Regenerates all IDs, clears foreignKey references, adds "(copy)" suffix
- **Selection never outlives its target**: `undo`, `redo`, `importDiagram` and
  `clearDiagram` replace the document wholesale, so they run the selection through
  `pruneSelection`. A selection pointing at a deleted id shows an empty properties
  panel and makes the next delete push an undo step that removes nothing

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DB Mapper is a visual database schema designer built with React and TypeScript. Users can create database diagrams with tables, relationships, groups, and notes. All data persists to localStorage with JSON export/import support.

## Development Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript check + production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Architecture

```
App.tsx
  └─ ThemeProvider (theme context)
      └─ ReactFlowProvider
          ├─ Toolbar (top bar controls)
          ├─ ReactFlow canvas (nodes + edges)
          │   ├─ Background, Controls, MiniMap
          │   └─ CoordinatesDisplay
          └─ PropertiesPanel (right sidebar editor)
```

### Data Flow

1. **Zustand store** (`src/store/useStore.ts`) is the single source of truth
2. Components read state via selectors and dispatch actions
3. Store persists to localStorage automatically (key: `db-mapper-storage`)
4. React Flow manages canvas viewport and interactions
5. History uses `structuredClone()` for deep copies (max 50 entries)

### Key Directories

- `src/components/nodes/` - Table, Group, Note node renderers (all memoized)
- `src/components/edges/` - RelationshipEdge with crow's foot markers
- `src/components/panels/` - PropertiesPanel, ColumnEditor, ColorPicker
- `src/components/dialogs/` - AddTableDialog, ConfirmDialog, KeyboardShortcutsDialog
- `src/components/ui/` - Radix UI primitives with Tailwind styling
- `src/store/` - Zustand store with all state and actions
- `src/types/` - TypeScript type definitions
- `src/hooks/` - useFileOperations hook

## Technology Stack

- **React Flow** (@xyflow/react 12.x) - Diagram canvas and node/edge rendering
- **Zustand** (5.x) - State management with persist middleware
- **Radix UI** - Accessible headless components
- **Tailwind CSS v4** - Utility-first styling with dark mode
- **Vite** - Build tool with single-file bundling (viteSingleFile plugin)

## State Management

### Store Structure

**Persisted state** (localStorage):
- `nodes: DBNode[]` - All diagram nodes
- `edges: DBEdge[]` - All relationships
- `theme: 'light' | 'dark' | 'system'`

**Non-persisted state** (resets on reload):
- `selectedNodeId`, `selectedEdgeId` - Current selection
- `history[]`, `historyIndex` - Undo/redo stack

### Action Categories

1. **React Flow**: `onNodesChange`, `onEdgesChange`, `onConnect`
2. **Nodes**: `addTable`, `addGroup`, `addNote`, `updateTable*`, `deleteNode`
3. **Columns**: `addColumn`, `updateColumn`, `deleteColumn`, `reorderColumns`
4. **Edges**: `updateEdgeCardinality`, `updateEdgeLabel`, `updateEdgeColumns`
5. **Selection**: `setSelectedNode`, `setSelectedEdge`, `clearSelection`
6. **History**: `saveToHistory`, `undo`, `redo`, `canUndo`, `canRedo`
7. **File**: `exportDiagram`, `importDiagram`, `clearDiagram`
8. **Clipboard**: `copySelectedNodes`, `pasteNodes`

### Usage Patterns

```typescript
// Selector pattern - single property
const nodes = useStore((state) => state.nodes);

// Selector pattern - derived data
const selectedNode = useStore((state) =>
  state.nodes.find(n => n.id === state.selectedNodeId)
);

// Multiple related properties - use useShallow
const { nodes, edges } = useStore(useShallow((state) => ({
  nodes: state.nodes,
  edges: state.edges
})));

// Action access
const updateTableName = useStore((state) => state.updateTableName);
```

### History Pattern

Most actions call `saveToHistory()` before mutations:
```typescript
updateTableName: (nodeId, name) => {
  get().saveToHistory();  // Snapshot BEFORE change
  set({ /* update */ });
}
```

## Key Conventions

### TypeScript

- Strict mode enabled with all flags
- Use discriminated unions for node types (`data.type === 'table'`)
- Path alias `@/*` maps to `src/*`

### Types

```typescript
// Node type narrowing
if (node.data.type === 'table') {
  node.data.columns  // TypeScript knows this is TableNodeData
}

// Cardinality types
type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many'

// ClipboardData for copy-paste validation
interface ClipboardData {
  type: 'db-mapper-nodes';
  version: '1.0';
  nodes: DBNode[];
}
```

### Styling

- Dark mode via class-based approach (`dark:` prefix)
- HSL CSS variables for theme colors
- 8 preset colors: slate, red, orange, yellow, green, blue, purple, pink
- Use `cn()` helper for conditional classes

### Components

- Memoize all node/edge components with `React.memo()`
- Use `useCallback` for event handlers passed to children
- Use Radix UI wrappers from `components/ui/`
- Use `class-variance-authority` for component variants

## Connection Handles

TableNode uses distinct handle shapes for visual clarity:
- **Top handle** (target): Amber square - receives incoming connections
- **Bottom handle** (source): Blue circle - initiates outgoing connections
- **Per-column handles**:
  - Left (target, ID: `${column.id}-left`): Amber square
  - Right (source, ID: `${column.id}-right`): Blue circle

When updating edge columns, also update React Flow handles:
```typescript
sourceHandle: sourceColumn ? `${sourceColumn}-right` : edge.sourceHandle,
targetHandle: targetColumn ? `${targetColumn}-left` : edge.targetHandle,
```

## Copy-Paste System

**Copy** (`copySelectedNodes`):
- Reads `node.selected` flag from React Flow
- Writes `ClipboardData` to navigator.clipboard

**Paste** (`pasteNodes`):
- Validates clipboard format via `type: 'db-mapper-nodes'`
- Regenerates all node and column IDs (prevents collisions)
- Clears `foreignKey` references (original tables don't exist)
- Preserves relative positions of multi-node selections
- Adds "(copy)" suffix to names

## Keyboard Shortcuts

- `Ctrl+C`: Copy selected nodes
- `Ctrl+V`: Paste at viewport center
- `Delete/Backspace`: Delete selected element
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z` / `Ctrl+Y`: Redo

Shortcuts are disabled when input elements are focused (via `isInputFocused()` helper).

## File Operations

- **Save**: Uses File System API (`showSaveFilePicker`)
- **Load**: File picker for JSON import
- **Drag-drop**: Drop `.json` files on canvas to import
- Format: `{ nodes: DBNode[], edges: DBEdge[] }`

## Node Behaviors

### Tables
- Columns with data types, constraints (PK, FK, unique, nullable, auto-increment)
- Per-column connection handles for specific relationships
- NodeResizer (min: 200x150px)

### Relationships
- Crow's foot notation via SVG markers
- Table edges: solid lines with cardinality
- Note edges: dashed lines, no cardinality

### Groups
- Container nodes (no handles)
- Semi-transparent backgrounds
- NodeResizer (min: 200x100px)

### Notes
- Double-click to edit content/name inline
- Single source handle for linking
- NodeResizer (min: 150x100px)

## Build Configuration

- **Target**: ES2020
- **Single-file output**: `viteSingleFile` plugin inlines all assets
- **Asset inline limit**: 100MB (for complete bundling)

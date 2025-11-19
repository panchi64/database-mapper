# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Components Architecture

This directory contains all React components organized by their function in the application.

### Directory Structure

- **nodes/**: React Flow node type components (TableNode, GroupNode, NoteNode) - all memoized
- **edges/**: React Flow edge type components (RelationshipEdge) - memoized
- **panels/**: Right sidebar editor components (PropertiesPanel, ColumnEditor, ColorPicker)
- **dialogs/**: Modal dialog components (AddTableDialog, ConfirmDialog, KeyboardShortcutsDialog)
- **ui/**: Radix UI primitive wrappers with Tailwind styling

### Component Patterns

**Memoization**: All node and edge components use `React.memo()`:
- TableNode, GroupNode, NoteNode, RelationshipEdge
- ColumnRow (inside TableNode) is also memoized
- Use `useCallback` for event handlers passed to children

**Radix UI Wrappers**: All components in `ui/` follow the same pattern:
- Import Radix primitives
- Re-export parts with Tailwind styling via `className`
- Use `class-variance-authority` for variant-based styling
- Forward refs for accessibility

### Node Components

Each node component receives `data` prop with specific shape:
- **TableNode**: `{ type: 'table', name, columns, color?, comment? }`
- **GroupNode**: `{ type: 'group', name, color? }`
- **NoteNode**: `{ type: 'note', name, content, color? }`

**Connection Handles** (TableNode uses distinct shapes for clarity):
- Top handle (target): Amber square `!rounded-sm` - receives connections
- Bottom handle (source): Blue circle `!rounded-full` - initiates connections
- Per-column handles:
  - Left (target, ID: `${column.id}-left`): Amber square
  - Right (source, ID: `${column.id}-right`): Blue circle

**NoteNode Inline Editing**:
- Double-click content or name to enter edit mode
- Escape cancels, blur saves
- Uses local state for editing (`isEditing`, `isEditingName`)

**Context Menus**: All node components have right-click context menus with Copy and Delete actions.

**NodeResizer**: Each node has resize constraints:
- TableNode: min 200x150px
- GroupNode: min 200x100px
- NoteNode: min 150x100px

### Edge Components

**RelationshipEdge** renders database relationships with crow's foot notation:
- `CrowsFootMarker` sub-component renders SVG markers
- One side: perpendicular line (|), Many side: crow's foot (<)
- Table edges: solid lines with cardinality markers
- Note edges: dashed lines (4 4 pattern), no cardinality
- Selected state: primary color with 2.5px stroke

### Panels

**PropertiesPanel** conditionally renders editors based on selected node/edge type:
- Empty state: Shows onboarding steps if no nodes exist
- Table: name, color (ColorPicker), comment, column list
- Group: name, color
- Note: name, content textarea, color
- Edge: cardinality selector, source/target column selectors, label

Uses `useShallow` for accessing multiple related properties efficiently.

**ColumnEditor** handles complex column management:
- Collapsible UI: toggle between row view and expanded form
- Fields: name, data type, length (conditional), default value
- Constraints: PK, unique, nullable, auto-increment toggles with tooltips
- Double-tap delete confirmation (3-second timeout)

**ColorPicker**: Grid of 8 preset colors with checkmark indicator for selection.

### Styling Conventions

- Dark mode: Use `dark:` prefix for dark mode variants
- Colors: Use HSL CSS variables (e.g., `hsl(var(--primary))`)
- 8 preset colors: slate, red, orange, yellow, green, blue, purple, pink
- Use `cn()` helper for conditional class merging

### Key Interactions

Components communicate with Zustand store via `useStore` hook:
```typescript
// Selector pattern - minimizes re-renders
const nodes = useStore((state) => state.nodes);
const selectedNode = useStore((state) =>
  state.nodes.find(n => n.id === state.selectedNodeId)
);

// Multiple properties with useShallow
const { nodes, edges } = useStore(useShallow((state) => ({
  nodes: state.nodes,
  edges: state.edges
})));

// Action access
const updateTableName = useStore((state) => state.updateTableName);
```

### Keyboard Shortcuts (handled in App.tsx)

- `Ctrl+C`: Copy selected nodes (via `copySelectedNodes`)
- `Ctrl+V`: Paste at viewport center (via `pasteNodes`)
- `Delete/Backspace`: Delete selected element
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z` / `Ctrl+Y`: Redo

Shortcuts disabled when input elements are focused (checked via `isInputFocused()` helper).

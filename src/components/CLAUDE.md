# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Components Architecture

This directory contains all React components organized by their function in the application.

### Directory Structure

- **nodes/**: React Flow node type components (TableNode, GroupNode, NoteNode)
- **edges/**: React Flow edge type components (RelationshipEdge)
- **panels/**: Right sidebar editor components (PropertiesPanel, ColumnEditor, ColorPicker)
- **dialogs/**: Modal dialog components (AddTableDialog, ConfirmDialog, KeyboardShortcutsDialog)
- **ui/**: Radix UI primitive wrappers with Tailwind styling

### Component Patterns

**Memoization**: Performance-critical components (TableNode, RelationshipEdge) use `memo()` to prevent unnecessary re-renders during diagram interactions.

**Radix UI Wrappers**: All components in `ui/` follow the same pattern:
- Import Radix primitives
- Re-export parts with Tailwind styling via `className`
- Use `class-variance-authority` for variant-based styling
- Forward refs for accessibility

### Node Components

Each node component receives `data` prop with specific shape:
- **TableNode**: `{ type: 'table', name, columns, color?, comment? }`
- **GroupNode**: `{ type: 'group', name, color?, collapsed? }`
- **NoteNode**: `{ type: 'note', content, color? }`

Nodes render connection handles (source/target) for React Flow edge connections.

### Edge Components

**RelationshipEdge** renders database relationships with crow's foot notation:
- Custom SVG markers defined for cardinality (one, many)
- Path computation uses `getBezierPath` from React Flow
- Click handler selects edge for property editing

### Panels

**PropertiesPanel** conditionally renders editors based on selected node/edge type:
- Table properties: name, color, comment
- Group properties: name, color
- Note properties: content, color
- Edge properties: cardinality, labels

**ColumnEditor** handles complex column management:
- Add/update/delete columns
- Drag-to-reorder functionality
- Foreign key references to other tables

### Styling Conventions

- Dark mode: Use `dark:` prefix for dark mode variants
- Colors: Use HSL CSS variables (e.g., `hsl(var(--primary))`)
- Node colors: Map to predefined palette (slate, blue, green, purple, orange, red)

### Key Interactions

Components communicate with Zustand store via `useStore` hook:
```typescript
const { updateNode, deleteNode, selectedId } = useStore();
```

Access store state with selectors to minimize re-renders:
```typescript
const nodes = useStore((state) => state.nodes);
```

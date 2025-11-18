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
          └─ PropertiesPanel (right sidebar editor)
```

### Data Flow

1. **Zustand store** (`src/store/useStore.ts`) is the single source of truth
2. Components read state via selectors and dispatch actions
3. Store persists to localStorage automatically
4. React Flow manages canvas viewport and interactions

### Key Directories

- `src/components/nodes/` - Table, Group, Note node renderers
- `src/components/edges/` - Relationship edge with cardinality markers
- `src/components/panels/` - PropertiesPanel and ColumnEditor
- `src/components/ui/` - Radix UI primitives with Tailwind styling
- `src/store/` - Zustand store with all state and actions
- `src/types/` - TypeScript type definitions
- `src/hooks/` - Custom hooks (useFileOperations)

## Technology Stack

- **React Flow** (@xyflow/react) - Diagram canvas and node/edge rendering
- **Zustand** - State management with persistence middleware
- **Radix UI** - Accessible headless components
- **Tailwind CSS v4** - Utility-first styling with dark mode
- **Vite** - Build tool with single-file bundling

## Key Conventions

### TypeScript

- Strict mode enabled
- Use discriminated unions for node types (`data.type === 'table'`)
- Path alias `@/*` maps to `src/*`

### State Management

- Access store with selectors: `useStore((state) => state.nodes)`
- Most actions auto-push history for undo/redo
- History limited to 50 entries

### Styling

- Dark mode via class-based approach (`dark:` prefix)
- HSL CSS variables for theme colors
- Node colors use predefined palette (slate, blue, green, purple, orange, red)

### Components

- Memoize performance-critical components (nodes, edges)
- Use Radix UI wrappers from `components/ui/`
- Use `class-variance-authority` for component variants

## Diagram Elements

### Tables
- Have columns with data types, constraints (PK, FK, unique, nullable)
- Connection handles for creating relationships
- Color-coded headers

### Relationships
- Rendered with crow's foot notation for cardinality
- Types: one-to-one, one-to-many, many-to-many
- Can specify source/target columns

### Groups
- Container nodes for organizing tables
- Collapsible with color customization

### Notes
- Freeform text annotations
- Color customization

## Keyboard Shortcuts

- Delete/Backspace: Delete selected element
- Ctrl+Z: Undo
- Ctrl+Shift+Z / Ctrl+Y: Redo

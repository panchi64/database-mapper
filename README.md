# DB Mapper

A visual database mapping designer built with React. Create database diagrams with tables, relationships, groups, and notes—all in your browser.

## Features

- **Tables** - Create tables with columns, data types (VARCHAR, INT, TEXT, etc.), and constraints (PK, FK, unique, nullable, auto-increment)
- **Relationships** - Connect tables with crow's foot notation showing cardinality (one-to-one, one-to-many, many-to-many)
- **Groups** - Organize tables into collapsible containers
- **Notes** - Add freeform text annotations anywhere on the canvas
- **Import/Export** - Save diagrams as JSON files and load them later
- **Undo/Redo** - Full history support with 50-entry limit
- **Themes** - Light, dark, and system-preference modes
- **Offline-Ready** - Works entirely in the browser with localStorage persistence

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Building a Single HTML File

DB Mapper builds into a single self-contained HTML file that works offline and can be shared or hosted anywhere without server dependencies.

```bash
# Build the application
npm run build
```

This creates `dist/index.html` (~560KB) containing all JavaScript, CSS, and assets inlined. You can:

- Open it directly in any modern browser
- Share it as a single file
- Host it on any static file server
- Run it completely offline

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Technology Stack

- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool with single-file bundling
- **React Flow** - Diagram canvas and interactions
- **Zustand** - State management with persistence
- **Radix UI** - Accessible UI components
- **Tailwind CSS** - Utility-first styling

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected element |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

## Data Storage

All diagram data persists automatically to your browser's localStorage. Use the toolbar buttons to:

- **Export** - Download your diagram as a JSON file
- **Import** - Load a previously exported diagram
- **Clear** - Reset the canvas (with confirmation)

## License

MIT

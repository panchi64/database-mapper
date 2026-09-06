# DB Mapper

A visual database schema designer that runs entirely in your browser and builds
to a single HTML file you can email to someone.

## Features

- **Tables** — columns with data types and constraints (PK, FK, unique, nullable,
  auto-increment). Tables size themselves to their contents.
- **Relationships** — crow's foot notation for one-to-one, one-to-many and
  many-to-many, with an on-canvas legend so the notation is never a guess.
- **Readable edges** — orthogonal routing that goes *around* tables rather than
  behind them, and spreads parallel relationships into separate lanes. Drag a
  line to pin a bend; drag an end to re-anchor it to a different column.
- **Connect without dragging** — press `C` for a searchable picker that suggests
  the target from the `<thing>_id` convention and infers the cardinality.
- **Auto-arrange** — layered layout, left-to-right or top-to-bottom, or a grid.
- **SQL** — paste `CREATE TABLE` statements to build a diagram; export back to
  PostgreSQL, MySQL or SQLite.
- **Export** — PNG and SVG as well as JSON.
- **Groups and notes** — regions and freeform annotations.
- **Outline panel** — a navigable tree of the schema, which is also how you
  select and copy text out of a canvas.
- **Undo/redo, themes, offline** — 50 steps of history, light/dark/system, and
  localStorage persistence.

## Quick start

```bash
bun install
bun dev
```

Open http://localhost:5173.

Load `fixtures/ecommerce.json` from the toolbar to see a worked example — see
[`fixtures/README.md`](fixtures/README.md).

## Single-file build

```bash
bun run build
```

Produces `dist/index.html` (~515 KB) with all JavaScript, CSS and assets inlined.
Open it directly, share it, host it on any static server, or run it offline.

The build **fails if the bundle exceeds its budget** — see
`scripts/check-bundle-size.ts`. The single-file property is easy to erode by
accident, so it is enforced rather than hoped for.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server with hot reload |
| `bun run build` | Typecheck, build, and check the bundle size |
| `bun run lint` | ESLint |
| `bun run test` | Vitest |
| `bun run coverage` | Vitest with coverage |
| `bun run fixtures` | Regenerate the sample diagrams |
| `bun run scripts/route-perf.ts` | Edge routing against the performance budget |

## Technology

- **React** + **TypeScript** + **Vite**
- **A custom canvas engine** (`src/engine/`) — the diagram is not drawn by a
  library. Geometry, routing, layout, hit-testing and the SQL reader are all
  first-party, which is what keeps a feature-complete schema designer inside one
  ~515 KB file with no diagramming dependency.
- **Zustand** for state, with a versioned, migrating localStorage schema
- **Radix UI** primitives, **Tailwind CSS**

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `C` | Add a relationship |
| `Ctrl+F` | Search tables and columns |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selected nodes |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete the selection |
| `Space`-drag or middle-drag | Pan |
| `Alt`-drag | Move freely, ignoring the grid |

## Data

Diagrams persist to localStorage automatically. Exported `.json` files carry a
format version, and files written by any older build still open — the importer
runs them through the same migration chain (see [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)).

## License

MIT

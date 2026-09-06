# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project

DB Mapper is a visual database schema designer. Tables, relationships, groups and
notes on an infinite canvas, persisted to localStorage, with JSON and SQL
import/export. It builds to **one self-contained HTML file**.

The diagram is drawn by a **custom canvas engine** in `src/engine/`, not by a
library. That engine is the centre of gravity of this codebase — read
`src/engine/CLAUDE.md` before touching anything that draws, routes or hit-tests.

## Commands

```bash
bun dev          # Vite dev server
bun run build    # typecheck + build + bundle-size check
bun run lint     # ESLint
bun run test     # Vitest
bun run coverage # Vitest with coverage
bun run fixtures # regenerate fixtures/ (see fixtures/README.md)
bun run scripts/route-perf.ts   # edge routing against the perf budget
```

`bun run build` fails if `dist/index.html` exceeds the budget in
`scripts/check-bundle-size.ts`. That is deliberate: the single-file property is
easy to erode by accident.

## Architecture

```
App
 └─ ThemeProvider
     └─ CanvasApiProvider          camera access for components outside the canvas
         ├─ Toolbar
         ├─ OutlinePanel           DOM tree of the diagram (a11y + navigation)
         ├─ DiagramCanvas          the canvas surface
         │   ├─ useCanvasEngine    renderer, interactions, viewport
         │   ├─ CanvasContextMenu  one Radix trigger for the whole canvas
         │   ├─ CanvasControls / CanvasMinimap / NotationLegend
         │   └─ InlineEditor       a real <input> floated over the canvas
         ├─ GlobalSearch
         ├─ ConnectDialog          click-to-connect picker
         └─ PropertiesPanel
```

### Layers

| Layer | Location | Depends on |
|---|---|---|
| Types | `src/types/` | nothing |
| Engine | `src/engine/` | types only |
| Store | `src/store/` | types, engine |
| Components | `src/components/` | all of the above |

The engine never imports from `src/components/` or `src/store/`, and only ever
imports *types* from `@/types`. That is what lets routing, layout and SQL run in a
plain Node test with no DOM.

## Data model

Nodes carry flat, explicit geometry (`x/y/w/h`); edges carry structured endpoints
(`{nodeId, columnId?, side?}`). See `src/types/CLAUDE.md` for the details and for
the two rules that catch people out:

- **Narrow on `node.type`, not `node.data.type`** — only the former narrows `node`.
- **Table height is derived, never authored** — `intrinsicTableHeight` is the
  authority, re-applied by the store's `resized()` helper.

`Column.foreignKey` is derived from the edges by `syncForeignKeys`. Never set it
by hand.

## Store

Zustand with persist. Key `db-mapper-storage`, **schema version 3** — see
`docs/MIGRATIONS.md`, and note the rule that migrations chain with `version < n`.

Persisted: `nodes`, `edges`, `theme`, `showOutline`. Everything else — selection,
history, search, the connect dialog — is transient by design.

Undo/redo is a past/future stack pair around the live document; actions call
`saveToHistory()` *before* mutating. See `src/store/CLAUDE.md`.

## Conventions

- **Bun**, not npm.
- TypeScript strict; `@/*` maps to `src/*`.
- A file exporting a component exports *only* components — Fast Refresh needs
  that. Hooks and contexts go in a sibling `.ts`.
- Prefer a hand-rolled implementation to a dependency when the dependency is
  large relative to the whole app. Routing, layout and the SQL reader are all
  hand-rolled for this reason, and the bundle check enforces the outcome.
- Tests live beside their subject. Pure logic runs in `node`; anything needing a
  DOM opts in with a `// @vitest-environment jsdom` docblock.

## Testing

`src/test/canvasStub.ts` provides a recording 2D context — jsdom has no canvas
and we do not want a native `canvas` build in the tree. Assert on *draw commands*
or on the `Scene` structure, never on pixels.

`fixtures/` holds diagrams for manual verification, validated by
`src/lib/fixtures.test.ts` so a stale fixture fails the suite rather than looking
like a rendering bug.

## Keyboard

| | |
|---|---|
| `C` | Connect picker |
| `Ctrl+F` | Search |
| `Ctrl+C` / `Ctrl+V` | Copy / paste nodes |
| `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo |
| `Delete` / `Backspace` | Delete selection |
| `Space`-drag, middle-drag | Pan |
| `Alt`-drag | Bypass grid snapping |

Shortcuts are suppressed while a text field has focus (`isInputFocused`).

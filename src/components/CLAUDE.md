# CLAUDE.md

Guidance for `src/components/`.

## Layout

- **`canvas/`** — the diagram surface. React's only contact with the rendering
  engine in `src/engine/`.
- **`panels/`** — right sidebar: `PropertiesPanel`, `ColumnEditor`, `ColorPicker`
- **`dialogs/`** — `AddTableDialog`, `ConfirmDialog`, `KeyboardShortcutsDialog`
- **`ui/`** — Radix primitives with Tailwind styling
- `Toolbar.tsx`, `GlobalSearch.tsx`, `ThemeProvider.tsx`

There is no `nodes/` or `edges/` directory any more. Tables, groups, notes and
relationships are not React components — they are painted by `src/engine/draw/`.
A change to how a table *looks* goes there, not here.

## The canvas boundary

`canvas/DiagramCanvas.tsx` is the surface. `canvas/useCanvasEngine.ts` owns the
engine objects and the render loop.

**Nothing in the canvas re-renders per frame.** The store subscription writes into
a ref and calls `renderer.invalidate()`; the renderer pulls from that ref inside
its own rAF. React re-renders only for the context menu and the inline editor.

Three pieces of DOM necessarily float above the canvas:

- `CanvasContextMenu` — **one** Radix trigger for the whole canvas. Each node used
  to wrap itself in a `ContextMenuTrigger`, which only worked while every node was
  a DOM element. A capture-phase `contextmenu` handler hit-tests *before* Radix
  opens, so the menu can describe whatever was actually clicked.
- `InlineEditor` — a real `<input>`/`<textarea>` positioned over the text being
  edited and scaled with the viewport. A canvas cannot hold a caret. Exactly one
  is alive at a time.
- `CanvasControls` / `CanvasMinimap` — zoom, fit, and an overview.

Radix portals to `document.body`, so menus and dialogs float above the canvas with
no z-index fight.

## Reaching the camera from outside

`canvas/canvasApi.ts` exposes `centerOnNode` and `viewportCenterWorld`. This is
what replaced `useReactFlow()`; global search and the toolbar use it.

It is deliberately imperative and deliberately small. Anything that needs the
viewport *continuously* lives inside the canvas and subscribes to the controller
with `useViewportValue` — panning changes it ~60 times a second, so re-rendering
on it is always opt-in.

The context holds a *ref*, not the API itself: the canvas publishes it after
mounting, and every consumer calls it from an event handler, so nobody needs to
re-render when it appears.

## Store access

```typescript
// Single property
const nodes = useStore((state) => state.nodes);

// Several related properties
const { nodes, edges } = useStore(useShallow((state) => ({
  nodes: state.nodes,
  edges: state.edges,
})));
```

Inside the engine, read the store imperatively with `useStore.getState()` — engine
callbacks fire outside React's render cycle.

## Conventions

- Radix wrappers in `ui/` are not modified by hand.
- `cn()` for conditional classes; `class-variance-authority` for variants.
- A file exporting a component exports *only* components — React Fast Refresh
  needs that. Hooks and context objects go in a sibling `.ts` file (see
  `canvas/canvasApi.ts` next to `canvas/CanvasApiProvider.tsx`).
- Keyboard shortcuts live in `src/hooks/useKeyboardShortcuts.ts`, not in a
  component.

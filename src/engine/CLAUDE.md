# CLAUDE.md

Guidance for `src/engine/` — the custom canvas rendering engine.

## Why this exists

The diagram used to be drawn by `@xyflow/react`. React Flow owned the coordinate
system, hit-testing and node measurement, which meant a column's connection point
was whatever the DOM had laid out — measured after the fact and never stored. Edge
routing and click-to-connect both need that answer *before* anything is drawn, so
the library had to go. Removing it also took ~177 KB off the single-file bundle.

## The keystone: geometry is deterministic

`geometry.ts` computes layout from data, as pure functions. A table's height is
`headerH + rowH × columns`; a column's port is at a computable point. No DOM, no
canvas, no React.

Everything else derives from it — the renderer, the router, hit-testing, layout,
export. **If you find yourself measuring something to find out where it is, stop:
the answer belongs in `geometry.ts`.**

Two invariants that fall out of this:

- **Tables auto-size vertically.** A table that could scroll internally could hide
  a column, and a hidden column has no on-screen port for an edge to attach to.
  `intrinsicTableHeight` is authoritative; the store's `resized()` re-applies it.
- **`METRICS` is the only place pixel constants live.** The renderer, the router
  and the hit-tester all read it, so changing a number there moves the drawing,
  the routing and the click targets together.
- **`nodeSizeLimits(node)` is the only place a resize is bounded.** Both ends of
  a resize read it — `resizedRect` for the live preview, the store's
  `resizeNode` for the commit — so the shape under the pointer is the shape that
  lands. They used to clamp against different constants, which let a note
  preview stop at the *table* minimum and a table preview run past `maxW` and
  snap back on release.

## Module map

| Module | Responsibility |
|---|---|
| `geometry.ts` | `METRICS`, `FONTS`, rects, node/row/port positions. Pure. |
| `theme.ts` | Resolves CSS custom properties to concrete colours — a canvas cannot use `hsl(var(--border))`. |
| `text.ts` | LRU-cached `measureText`, truncation, word wrap. |
| `viewport.ts` | World↔screen transforms, `fitView`, `centerOn`, `zoomAt`, and `ViewportController`. |
| `primitives.ts` | The drawing vocabulary and the `Scene` shape. |
| `draw/` | `table`, `note`, `group`, `edge` painters. Emit primitives; never touch a context. |
| `scene.ts` | `buildScene` — culling, level of detail, focus dimming. Pure. |
| `painter.ts` | The only module that calls canvas drawing operations. |
| `renderer.ts` | rAF loop, DPR, per-node bitmap cache. |
| `hitTest.ts` | `pick` — what is under a point. |
| `interactions.ts` | Pointer state machine. |
| `routing/` | Endpoint resolution, obstacle-avoiding A*, lane bundling. |
| `layout/` | Layered auto-layout (Sugiyama-lite) and a grid fallback. |
| `sql/` | A tolerant `CREATE TABLE` reader and a DDL writer. |
| `export/` | PNG via the painter, SVG via a second `Primitive` backend. |

## Rules that keep it working

**A scene is data, not draw calls.** `buildScene` returns a `Scene`; `painter.ts`
renders it. That indirection is why the same frame can go to a canvas, an
offscreen bitmap cache, a minimap, or the SVG exporter — and why the whole
frame is assertable in a unit test without comparing pixels. Do not let a painter
reach for a `CanvasRenderingContext2D`.

**Node primitives are in local coordinates.** Relative to the node's own origin,
so the node can be rasterised once and blitted wherever it currently sits.
`cacheKey` must change exactly when the bitmap would — and must *not* change for
selection or hover, which are drawn as `decorations` outside the cached bitmap.

**Tolerances are in screen pixels, converted to world.** `tol / zoom`. A port must
be no harder to grab at 40% zoom than at 100%.

**Drags are transient until they commit.** In-flight offsets live in
`InteractionController` and reach the frame through `applyTransient`. The store is
written once, on pointer-up, as a single undoable step. Writing per pointer-move
would mean 60 store updates and 60 history entries per second.

**The viewport is not React state.** It changes ~60 times a second while panning.
It lives in `ViewportController`; the renderer reads it directly. Components that
must display it subscribe explicitly via `useViewportValue`.

## Routing

`routeEdges` is the only entry point. Behind it: resolve each end to a port and a
direction, step out perpendicular by `STUB`, A* between the stub points over a
Hanan grid, then fan overlapping runs into lanes.

Three things are load-bearing:

- **Both endpoint nodes are obstacles.** That is what stops a line reaching a
  column by passing behind its own table.
- **Groups are not obstacles.** They are regions; treating them as solid would
  make it impossible to route between two tables inside one.
- **The grid is per-route and clipped** to the endpoints' neighbourhood, capped
  at the 40 nearest obstacles. A global Hanan grid over 300 tables is ~1200x1200
  and cannot be searched inside a frame.

Escape hatches, both mandatory: edges attached to a dragging node take
`cheapRoute`, and any search that exceeds `maxExpansions` falls back to it too. A
briefly ugly edge beats a dropped frame.

Lane bundling is a *post-pass*, not part of the search. Two relationships between
the same pair of tables have genuinely identical optimal paths — no smarter search
separates them.

`waypoints` on an edge split the route into legs, each searched independently, so
a nudged edge still avoids obstacles.

`routingSignature(nodes, edges)` is the gate in front of all of it: it fingerprints
only what the router reads — node rects, column order, endpoints, waypoints — so
renaming a column or recolouring an edge no longer triggers a full reroute. Array
identity is far too coarse a trigger for something that costs tens of milliseconds.

## Performance budget

300 tables / 2500 columns / 500 edges:

- pan and zoom ≤ 6 ms/frame
- single-node drag ≤ 8 ms/frame
- full reroute of 500 edges ≤ 120 ms, debounced off the drag path
- cold `fitView` ≤ 200 ms

What buys this: viewport culling, a `compact` level of detail below `zoom 0.4`
(header-only, no per-row work), and the per-node bitmap cache — a painted frame is
mostly `drawImage` calls. Hit-testing is a reverse-z linear scan, not a tree; at
this scale it is well under 0.1 ms and needs no rebuilding on drag.

## Testing

Never assert pixels. `src/test/canvasStub.ts` provides a recording context: assert
on the *commands* emitted. Scene contents are asserted on the `Scene` structure
directly. Text metrics in tests are a deterministic 6px per character, so layout
tests pin relationships between measurements rather than font specifics.

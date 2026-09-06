# Fixtures

Sample diagrams for verifying the app by hand. Load one from the toolbar, or drag
the file onto the canvas.

Regenerate with `bun run fixtures`. They are validated by
`src/lib/fixtures.test.ts`, so a stale fixture fails the test suite rather than
quietly looking like a rendering bug.

| File | What it's for |
|---|---|
| `ecommerce.json` | 16 tables, 105 columns, 24 relationships. The one to look at first. |
| `legacy-reactflow-export.json` | The same diagram in the **old** React Flow format. Tests the migration path. |
| `stress-300-tables.json` | 300 tables / ~3000 columns / 353 relationships. The performance budget. |

## `ecommerce.json` — what it deliberately covers

A realistic shop schema, laid out in clusters that force edges across the diagram
rather than between neighbours.

- **All 8 preset colours**, so the palette can be judged at a glance in both themes
- **All 3 cardinalities** — one-to-one (`payments` → `orders`), one-to-many
  (most), many-to-many (`order_coupons` → `coupons`)
- **All 4 line patterns** — solid, dashed, dotted, dash-dot
- **A self-referencing relationship** — `categories.parent_id` → `categories.id`
- **Two tables with the same target** — `orders` has both a shipping and a billing
  address pointing at `addresses`, which is the classic case where two edges
  collapse into one line
- **Groups** (Catalog, Fulfilment) and **notes** with note links, which render
  dashed and without cardinality markers
- **Table comments**, which add a band under the header and change the height
- Every column flag: primary key, unique, nullable, auto-increment, foreign key

## What to check

Load `ecommerce.json` and look for:

1. **Tables** — header colour wash, the accent stripe, PK bars, FK and U pills,
   dimmed type labels on nullable columns
2. **Hover a table** — its ports appear, its edges highlight, every unrelated edge
   drops to ~15% opacity
3. **Drag** — a table, then several via marquee. Edges follow. One undo step per
   drag, not sixty
4. **Resize** — grab a corner of a selected table. Width changes; height stays
   locked to the column count
5. **Double-click** — a table name, and a note body
6. **Right-click** — a table, a column row, an edge, empty space
7. **Zoom out past ~40%** — tables collapse to header-only blocks
8. **Dark mode**
9. **`Ctrl+F`** — search a column name, click a result, watch it pan

Then `legacy-reactflow-export.json` — it should open as the same diagram, with FK
badges now present that the old format never stored.

Then `stress-300-tables.json` — pan and zoom should stay smooth, and edges should
route around tables rather than through them even at that density.

## Also worth trying

- **`C`** — the connect picker. With `orders.user_id` as the source it should
  suggest `users.id` on its own.
- **Drag a line** — pins a bend the router then routes around. Drag it back onto
  the automatic path, or right-click → Reset route, to clear it.
- **Select a relationship, then drag one of its square end handles** onto a
  different column to re-anchor it.
- **Arrange** — layered layout on this schema, then undo.
- **Export → SVG**, and compare it against the canvas. They are drawn from the
  same scene data, so they should match.
- **Toolbar → SQL** — paste a `CREATE TABLE` dump and watch the preview count
  tables before you commit to replacing the diagram.

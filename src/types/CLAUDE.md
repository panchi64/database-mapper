# CLAUDE.md

Guidance for working with `src/types/`.

## Scope

All shared TypeScript definitions live in `src/types/index.ts`. It has **no imports** — it is the root of the dependency graph, and everything else (store, engine, components) depends on it. Keep it that way; a type that needs to import something belongs closer to its owner.

## Nodes

Nodes carry their geometry **flat and explicitly**:

```typescript
interface BaseNode<K extends NodeKind, D> {
  id: string;
  type: K;            // 'table' | 'group' | 'note'
  data: D;
  x: number; y: number; w: number; h: number;
  autoSize?: boolean; // tables: height derived from column count
  z: number;          // paint order: groups 0, tables 1, notes 2
  parentId?: string;  // group containment
  locked?: boolean;
}

type DBNode = TableNode | GroupNode | NoteNode;
```

This replaced React Flow's `Node<D, K>`, where geometry was spread across `position`, `style.width/height` and a `measured` field the library wrote after layout — so a node's real size was only knowable *after* it had been rendered. Nothing could route an edge or place a port without a DOM.

Two consequences worth remembering:

- **Narrow on `node.type`, not `node.data.type`.** Both exist and are kept equal, but only the top-level one is a discriminant TypeScript can use to narrow `node` itself. `node.data.type === 'table'` narrows `node.data` and leaves `node` as the full union.
- **Table height is derived, never authored.** `intrinsicTableHeight(data)` in `@/engine/geometry` is the authority. Anything that changes a table's column list or comment must re-derive it (the store's `resized` helper does this).

## Edges

```typescript
interface EndpointRef {
  nodeId: string;
  columnId?: string;  // absent -> attaches to the node as a whole
  side?: Side;        // absent -> the router picks (the normal case)
}

interface DBEdge {
  id: string;
  source: EndpointRef;
  target: EndpointRef;
  data: RelationshipEdgeData;
}
```

This replaced the `source` + `sourceHandle` string pair, where the column was encoded into an id like `` `${columnId}-right` `` and parsed back out at every use site.

`side` is deliberately optional. Pinning a side at creation produces worse routes than letting the router choose per layout; it is only set when a user explicitly drags to a particular side.

`RelationshipEdgeData` no longer carries `sourceColumn`/`targetColumn` — those duplicated the endpoints. The endpoint is the single source of truth.

## Derived fields

`Column.foreignKey` is **derived from the edges, not authored**. The store's `syncForeignKeys` rewrites it whenever edge endpoints change. Never set it directly; create or rewire the edge and let the sync follow.

## Selection

Selection is **not** on the node. It lives in the store as `selectedNodeIds: Set<string>`, so it is never persisted and never lands on the undo stack.

## Adding a node type

1. Add a data interface with a `type` discriminator.
2. Add `BaseNode<'yourtype', YourData>` and extend the `DBNode` union.
3. Give it a draw function in `src/engine/draw/` and a case in the scene builder.
4. Add store actions if it needs its own mutations.
5. Add a persist migration if existing diagrams need backfilling — see `docs/MIGRATIONS.md`.

## Adding a column data type

1. Add to the `ColumnDataType` union.
2. Add to the `SQL_DATA_TYPES` array in the same file (the UI selects read it).
3. Update the length-field visibility logic in `ColumnEditor` if it takes a length.
4. Add a mapping in `src/engine/sql/dialects.ts` so DDL import recognises it.

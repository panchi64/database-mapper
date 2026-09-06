# Persisted Schema Migrations

How DB Mapper upgrades diagrams saved in localStorage when the schema changes.

## Where it lives

| Thing | File |
|---|---|
| Migration functions (pure, testable) | `src/store/migrations.ts` |
| Tests, including real version fixtures | `src/store/migrations.test.ts` |
| Wiring into Zustand persist | `src/store/useStore.ts` (`persist` options) |

**Current version: 3** (`CURRENT_SCHEMA_VERSION` in `src/store/migrations.ts`)
**Storage key: `db-mapper-storage`**

Diagram `.json` files carry the same version as `formatVersion`, and are read by
`src/lib/diagramFile.ts` through this same migration chain — so a file exported by
any older build still opens. See `parseDiagramFile`.

Only `{ nodes, edges, theme }` is persisted — `partialize` drops selection, history and search, which are all transient by design.

## How it runs

Zustand compares the `version` recorded in localStorage against `CURRENT_SCHEMA_VERSION` on load. If they differ, `migrate` runs once and the result is written back at the new version.

`migrate` in `useStore.ts` is deliberately thin. It narrows the blob with `assertPersistedShape`, hands it to `runMigrations`, and owns only the failure path:

```ts
migrate: (persistedState: unknown, version: number): PersistedShape => {
  try {
    return runMigrations(assertPersistedShape(persistedState), version);
  } catch (error) {
    // Stash the raw blob under CORRUPT_BACKUP_KEY and start empty rather than
    // leaving the app wedged on state it cannot load.
  }
}
```

A diagram that fails to migrate is never silently discarded — the original JSON is copied to `db-mapper-storage-backup` first.

## Migrations must chain

This is the one rule that matters, and the one that was previously broken.

```ts
export function runMigrations(persisted: LegacyPersistedShape, version: number): PersistedShape {
  let legacy = persisted;
  if (version < 1) legacy = migrateV0toV1(legacy);
  if (version < 2) legacy = migrateV1toV2(legacy);
  if (version < 3) return migrateV2toV3(legacy);   // terminal: changes the shape
  return legacy as unknown as PersistedShape;
}
```

Use `version < n`, never `version === n`. An earlier implementation used `if (version === 0) return migrateV0toV1(state)`, which upgraded v0 data to v1 and returned it immediately — so anyone who hadn't opened the app since v0 never received the v1→v2 step. `runMigrations` is covered by a test asserting v0 data arrives with *both* `isNoteLink` and `pattern` set.

Each migration takes and returns a whole `PersistedShape`, updates immutably, and is idempotent where it cheaply can be (all of them skip fields that are already set, so re-running is harmless).

## Version history

### v0 — original, untracked

`{ nodes, edges, theme }` with no version field. `RelationshipEdgeData` had no `isNoteLink`.

### v1 — `isNoteLink` on edges

`RelationshipEdge` used to look its source and target nodes up from the store on every render to decide whether it was a note link. That read raced with node updates during drag and selection, so edges randomly disappeared. The flag is now computed once, when the edge is created, and stored on the edge.

`migrateV0toV1` backfills it by looking up each edge's endpoints and setting `isNoteLink = source is a note || target is a note`.

### v2 — `pattern` on edges

Edge line patterns became user-editable. v1 hard-coded a dashed stroke for note links, so `migrateV1toV2` writes `pattern: 'dashed'` onto existing note links to preserve their appearance. Table relationships are left without a pattern and render solid.

### v3 — our own schema, off React Flow's

The largest migration so far, and the only one that changes the *shape* of a node or edge rather than adding a field. It is therefore the terminal step in the chain: `migrateV2toV3` takes the legacy (React Flow) shape and returns the current one.

**Nodes** gain flat, explicit geometry:

```
{ position: {x,y}, style: {width,height}, measured, ... }   ->   { x, y, w, h }
```

Every React Flow runtime field is dropped rather than carried forward — `measured`, `dragging`, `positionAbsolute`, `handles`, `extent`, `style`, and `selected` (which should never have been persisted; selection now lives in `selectedNodeIds`, outside the nodes). `zIndex` becomes `z`.

Table heights are **recomputed** from the column count via `intrinsicTableHeight` rather than trusting the stored value, which was a stale DOM measurement. Tables auto-size vertically from v3 on: a table that could scroll internally could hide a column, and a hidden column has no on-screen port for an edge to attach to.

**Edges** gain structured endpoints. v2 encoded the column into a React Flow handle id and duplicated it onto `data`:

```
{ source: 'orders', sourceHandle: 'user_id-right', data: { sourceColumn: 'user_id' } }
   ->
{ source: { nodeId: 'orders', columnId: 'user_id', side: 'right' } }
```

`parseLegacyHandle` does the string parsing, falling back to `data.sourceColumn` for very old edges that recorded the column only there. The duplicated `data.sourceColumn`/`targetColumn` are dropped — the endpoint is now the single source of truth. `parseLegacyHandle` stays exported because the file importer still needs it.

**`Column.foreignKey` is backfilled.** The field has been in the types since the beginning and `TableNode` renders an FK badge from it, but nothing ever wrote it, so the badge never appeared. The edges already held the information, so the migration derives it. From v3 on, `syncForeignKeys` in the store keeps it in step as edges are created, rewired and deleted.

## Adding a migration

1. Write `migrateVNtoVN1(state: PersistedShape): PersistedShape` in `src/store/migrations.ts`. Pure function, immutable updates, skip anything already set.
2. Add `if (version < N+1) state = migrateVNtoVN1(state);` to `runMigrations`, in order.
3. Bump `CURRENT_SCHEMA_VERSION`.
4. Update the types in `src/types/index.ts`.
5. Add tests to `src/store/migrations.test.ts` — at minimum: the step itself, the full chain from v0, and idempotency.
6. Add a section to the version history above.

Never delete an old migration. Someone's browser still has v0 data in it.

## Testing against real old data

The unit tests cover the logic. To exercise the whole path end to end in a browser:

```js
localStorage.setItem('db-mapper-storage', JSON.stringify({
  state: { nodes: [/* ... */], edges: [/* ... */], theme: 'system' },
  version: 0,
}));
```

Reload, then confirm the diagram renders and `JSON.parse(localStorage['db-mapper-storage']).version === 2`.

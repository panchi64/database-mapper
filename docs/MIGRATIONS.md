# Database Schema Migrations

This document explains how the DB Mapper application handles schema migrations for persisted data in localStorage.

## Overview

DB Mapper uses Zustand's persist middleware with built-in version tracking and migration support. This ensures that users with old saved diagrams can seamlessly upgrade to new schema versions without data loss or manual intervention.

## Current Schema Version

**Version 1** (Current)

## Migration System Architecture

### How It Works

1. **Version Tracking**: Each persisted state includes a `version` field
2. **Automatic Detection**: When the app loads, Zustand compares stored version vs. current version
3. **Migration Execution**: If versions differ, the `migrate` function runs to upgrade the data
4. **One-Time Cost**: Migration runs once per version upgrade, not on every load
5. **Persistence**: Migrated data is saved back to localStorage with the new version

### Location

**File**: `src/store/useStore.ts`
**Lines**: 674-757 (persist configuration)

### Configuration Structure

```typescript
{
  name: 'db-mapper-storage',
  version: 1,  // Current schema version
  partialize: (state) => ({ /* ... */ }),
  migrate: (persistedState, version) => { /* ... */ }
}
```

## Version History

### Version 0 (Implicit)
**Description**: Original schema without version tracking

**Schema**:
```typescript
{
  nodes: DBNode[];
  edges: DBEdge[];
  theme: 'light' | 'dark' | 'system';
}
```

**Issues**:
- `RelationshipEdgeData` lacked `isNoteLink` field
- Edge rendering performed node lookups on every render
- Caused race conditions leading to edges randomly disappearing

### Version 1 (Current)
**Description**: Added `isNoteLink` field to edge data

**Schema Changes**:
```typescript
interface RelationshipEdgeData {
  type: 'relationship';
  cardinality?: Cardinality;
  label?: string;
  sourceColumn?: string;
  targetColumn?: string;
  isNoteLink?: boolean; // NEW FIELD
  [key: string]: unknown;
}
```

**Migration Logic** (v0 → v1):
- Iterates through all edges
- For edges missing `isNoteLink`:
  - Looks up source and target nodes
  - Computes `isNoteLink = sourceNode.type === 'note' || targetNode.type === 'note'`
  - Adds field to edge data
- Returns migrated state

**Benefits**:
- Eliminates store subscriptions in RelationshipEdge component
- Fixes race condition bug causing edges to disappear
- Improves rendering performance
- Maintains backward compatibility with old saved files

## Adding Future Migrations

### Step-by-Step Guide

When you need to make breaking changes to the persisted schema:

#### 1. Update the Version Number

```typescript
// In src/store/useStore.ts
{
  name: 'db-mapper-storage',
  version: 2,  // Increment from 1 to 2
  // ...
}
```

#### 2. Add Migration Case

```typescript
migrate: (persistedState: any, version: number) => {
  // Existing migration v0 → v1
  if (version === 0) {
    const state = persistedState as { /* ... */ };
    // ... migration logic ...
    persistedState = { ...state, edges: migratedEdges };
  }

  // NEW: Migration v1 → v2
  if (version < 2) {
    // Your migration logic here
    const state = persistedState as {
      nodes: DBNode[];
      edges: DBEdge[];
      theme: 'light' | 'dark' | 'system';
    };

    // Example: Add new field to nodes
    const migratedNodes = state.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        newField: 'default value',
      },
    }));

    persistedState = {
      ...state,
      nodes: migratedNodes,
    };
  }

  return persistedState;
},
```

#### 3. Update Type Definitions

Add the new field to your TypeScript types in `src/types/index.ts`:

```typescript
export interface YourNodeData {
  // ... existing fields ...
  newField?: string; // Add new field
}
```

#### 4. Update This Documentation

Add a new section under "Version History" documenting:
- What changed
- Why the migration was needed
- What the migration does
- Any special considerations

#### 5. Test the Migration

**Test with old data**:
1. Clear localStorage: `localStorage.removeItem('db-mapper-storage')`
2. Create test data in the old schema format
3. Manually set it in localStorage
4. Reload the app
5. Verify migration runs and data is correct

**Test with current data**:
1. Verify existing users (already on latest version) aren't affected
2. Confirm no unnecessary migrations run

### Migration Best Practices

✅ **DO**:
- Use `version < 2` instead of `version === 1` to handle skipped versions
- Document why the migration is needed
- Test with real-world old data before releasing
- Keep migrations simple and focused
- Add comprehensive comments explaining the logic
- Preserve user data - never delete without good reason

❌ **DON'T**:
- Remove old migration code (users might skip versions)
- Mutate `persistedState` directly (use immutable updates)
- Make migrations dependent on application state
- Forget to update TypeScript types
- Deploy without testing the migration path

### Migration Chaining

Users can skip multiple versions (e.g., v0 → v3). Migrations must chain correctly:

```typescript
migrate: (persistedState: any, version: number) => {
  let state = persistedState;

  // Chain migrations in order
  if (version < 1) {
    state = migrateV0ToV1(state);
  }

  if (version < 2) {
    state = migrateV1ToV2(state);
  }

  if (version < 3) {
    state = migrateV2ToV3(state);
  }

  return state;
}
```

This ensures users on v0 will go through all migrations (v0→v1→v2→v3) automatically.

### Helper Functions

For complex migrations, extract logic into helper functions:

```typescript
/**
 * Migrates edges from v0 to v1 by adding isNoteLink field
 */
const migrateEdgesToV1 = (state: any) => {
  const edges = state.edges.map((edge: DBEdge) => {
    if (edge.data?.isNoteLink !== undefined) return edge;

    const sourceNode = state.nodes.find(n => n.id === edge.source);
    const targetNode = state.nodes.find(n => n.id === edge.target);
    const isNoteLink = sourceNode?.data.type === 'note' ||
                       targetNode?.data.type === 'note';

    return { ...edge, data: { ...edge.data, isNoteLink } };
  });

  return { ...state, edges };
};

// Then use in migrate function:
if (version < 1) {
  state = migrateEdgesToV1(state);
}
```

## Troubleshooting

### Migration Not Running

**Check**:
- Is the version number incremented in the persist config?
- Is localStorage populated with old data?
- Are you testing in the same browser/domain?

**Debug**:
```javascript
// Add console.log in migrate function
migrate: (persistedState, version) => {
  console.log('Migration running from version:', version);
  // ...
}
```

### Data Loss After Migration

**Check**:
- Are you returning the full state object?
- Did you preserve all existing fields?
- Are you using immutable updates?

**Rollback**:
Users can restore old data from localStorage backups if needed.

### TypeScript Errors

**Common Issues**:
- Type mismatch between old and new schema
- Missing optional field markers (`?`)
- Type assertions needed for old data

**Solution**:
Use `any` for `persistedState` parameter and type-cast within migration:
```typescript
const state = persistedState as OldSchemaType;
```

## Related Files

- `src/store/useStore.ts` - Migration configuration
- `src/types/index.ts` - Type definitions
- `src/components/edges/RelationshipEdge.tsx` - Uses migrated data
- `docs/MIGRATIONS.md` - This file

## Additional Resources

- [Zustand Persist Middleware Docs](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
- [Zustand Migration Guide](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md#migrations)

import { describe, expect, it } from 'vitest';
import { METRICS, intrinsicTableHeight } from '@/engine/geometry';
import type { Column, TableNode, TableNodeData } from '@/types';
import {
  assertPersistedShape,
  migrateV0toV1,
  migrateV1toV2,
  migrateV2toV3,
  parseLegacyHandle,
  runMigrations,
  type LegacyPersistedShape,
} from './migrations';

// --- Fixtures: nodes and edges in the on-disk React Flow shape --------------

type LegacyNode = LegacyPersistedShape['nodes'][number];
type LegacyEdge = LegacyPersistedShape['edges'][number];

function column(id: string, name = id, over: Partial<Column> = {}): Column {
  return {
    id,
    name,
    dataType: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...over,
  };
}

function tableNode(id: string, over: Partial<LegacyNode> = {}, columns: Column[] = []): LegacyNode {
  return {
    id,
    type: 'table',
    position: { x: 10, y: 20 },
    style: { width: 250, height: 200 },
    data: { type: 'table', name: id, columns },
    ...over,
  };
}

function noteNode(id: string): LegacyNode {
  return {
    id,
    type: 'note',
    position: { x: 0, y: 0 },
    data: { type: 'note', name: 'Note', content: '' },
  };
}

/** An edge as v0 wrote it: no isNoteLink, no pattern. */
function v0Edge(id: string, source: string, target: string, over: Partial<LegacyEdge> = {}): LegacyEdge {
  return {
    id,
    source,
    target,
    type: 'relationship',
    data: { type: 'relationship', cardinality: 'one-to-many' },
    ...over,
  };
}

function state(nodes: LegacyNode[], edges: LegacyEdge[]): LegacyPersistedShape {
  return { nodes, edges, theme: 'system' };
}

// --- v0 -> v1 ---------------------------------------------------------------

describe('migrateV0toV1', () => {
  it('flags edges touching a note node', () => {
    const s = state([tableNode('t1'), noteNode('n1')], [v0Edge('e1', 't1', 'n1')]);
    expect(migrateV0toV1(s).edges[0].data?.isNoteLink).toBe(true);
  });

  it('leaves table-to-table edges unflagged', () => {
    const s = state([tableNode('t1'), tableNode('t2')], [v0Edge('e1', 't1', 't2')]);
    expect(migrateV0toV1(s).edges[0].data?.isNoteLink).toBe(false);
  });

  it('detects a note on either end', () => {
    const s = state([noteNode('n1'), tableNode('t1')], [v0Edge('e1', 'n1', 't1')]);
    expect(migrateV0toV1(s).edges[0].data?.isNoteLink).toBe(true);
  });

  it('never clobbers an isNoteLink that is already set', () => {
    const edge = v0Edge('e1', 't1', 't2', { data: { isNoteLink: true } });
    const s = state([tableNode('t1'), tableNode('t2')], [edge]);
    expect(migrateV0toV1(s).edges[0].data?.isNoteLink).toBe(true);
  });
});

// --- v1 -> v2 ---------------------------------------------------------------

describe('migrateV1toV2', () => {
  it('gives note links a dashed pattern', () => {
    const edge = v0Edge('e1', 't1', 'n1', { data: { isNoteLink: true } });
    expect(migrateV1toV2(state([], [edge])).edges[0].data?.pattern).toBe('dashed');
  });

  it('leaves table relationships without a pattern so they render solid', () => {
    const edge = v0Edge('e1', 't1', 't2', { data: { isNoteLink: false } });
    expect(migrateV1toV2(state([], [edge])).edges[0].data?.pattern).toBeUndefined();
  });

  it('never clobbers a pattern the user already chose', () => {
    const edge = v0Edge('e1', 't1', 'n1', { data: { isNoteLink: true, pattern: 'dotted' } });
    expect(migrateV1toV2(state([], [edge])).edges[0].data?.pattern).toBe('dotted');
  });
});

// --- Handle parsing ---------------------------------------------------------

describe('parseLegacyHandle', () => {
  it.each([
    ['col-1-right', { columnId: 'col-1', side: 'right' }],
    ['col-1-left', { columnId: 'col-1', side: 'left' }],
    ['top', { side: 'top' }],
    ['bottom', { side: 'bottom' }],
    [null, {}],
    [undefined, {}],
    ['garbage', {}],
  ])('parses %s', (handle, expected) => {
    expect(parseLegacyHandle(handle as string | null | undefined)).toEqual(expected);
  });

  it('keeps hyphens inside a uuid column id intact', () => {
    expect(parseLegacyHandle('7f3a-9b21-left')).toEqual({
      columnId: '7f3a-9b21',
      side: 'left',
    });
  });
});

// --- v2 -> v3 ---------------------------------------------------------------

describe('migrateV2toV3', () => {
  it('flattens position and style into x/y/w/h', () => {
    const s = state([tableNode('t1', { position: { x: 40, y: 90 }, style: { width: 300 } })], []);
    const node = migrateV2toV3(s).nodes[0];

    expect(node.x).toBe(40);
    expect(node.y).toBe(90);
    expect(node.w).toBe(300);
  });

  it('falls back to measured dimensions when style is absent', () => {
    const s = state(
      [{ id: 'g1', type: 'group', position: { x: 0, y: 0 }, measured: { width: 333, height: 222 }, data: { type: 'group', name: 'g' } }],
      []
    );
    const node = migrateV2toV3(s).nodes[0];

    expect(node.w).toBe(333);
    expect(node.h).toBe(222);
  });

  it('falls back to type defaults when nothing was recorded', () => {
    const s = state(
      [{ id: 'n1', type: 'note', position: {}, data: { type: 'note', name: 'n', content: '' } }],
      []
    );
    const node = migrateV2toV3(s).nodes[0];

    expect(node).toMatchObject({ x: 0, y: 0, w: METRICS.noteDefaultW, h: METRICS.noteDefaultH });
  });

  it('derives table height from the column count rather than trusting the stored value', () => {
    const columns = [column('c1'), column('c2'), column('c3')];
    // The stored height (200) is a stale React Flow measurement.
    const s = state([tableNode('t1', { style: { width: 250, height: 200 } }, columns)], []);

    const node = migrateV2toV3(s).nodes[0] as TableNode;

    expect(node.h).toBe(intrinsicTableHeight(node.data as TableNodeData));
    expect(node.h).toBe(METRICS.headerH + 3 * METRICS.rowH);
  });

  it('drops every React Flow runtime field', () => {
    const s = state(
      [tableNode('t1', {
        measured: { width: 1, height: 2 },
        zIndex: 7,
        // Fields React Flow wrote at runtime that were never ours.
        ...({ dragging: true, selected: true, positionAbsolute: { x: 1, y: 1 } } as object),
      })],
      []
    );

    const node = migrateV2toV3(s).nodes[0];

    expect(node).not.toHaveProperty('position');
    expect(node).not.toHaveProperty('style');
    expect(node).not.toHaveProperty('measured');
    expect(node).not.toHaveProperty('dragging');
    expect(node).not.toHaveProperty('selected');
    expect(node).not.toHaveProperty('positionAbsolute');
    expect(node.z).toBe(7);
  });

  it('turns handle strings into structured endpoints', () => {
    const edge = v0Edge('e1', 't1', 't2', {
      sourceHandle: 'c1-right',
      targetHandle: 'c2-left',
      data: { isNoteLink: false },
    });

    const migrated = migrateV2toV3(state([tableNode('t1'), tableNode('t2')], [edge])).edges[0];

    expect(migrated.source).toEqual({ nodeId: 't1', columnId: 'c1', side: 'right' });
    expect(migrated.target).toEqual({ nodeId: 't2', columnId: 'c2', side: 'left' });
  });

  it('falls back to the column ids on data when handles are missing', () => {
    const edge = v0Edge('e1', 't1', 't2', {
      data: { sourceColumn: 'c1', targetColumn: 'c2', isNoteLink: false },
    });

    const migrated = migrateV2toV3(state([tableNode('t1'), tableNode('t2')], [edge])).edges[0];

    expect(migrated.source.columnId).toBe('c1');
    expect(migrated.target.columnId).toBe('c2');
  });

  it('leaves node-level endpoints without a column', () => {
    const edge = v0Edge('e1', 't1', 'n1', {
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { isNoteLink: true },
    });

    const migrated = migrateV2toV3(state([tableNode('t1'), noteNode('n1')], [edge])).edges[0];

    expect(migrated.source).toEqual({ nodeId: 't1', side: 'bottom' });
    expect(migrated.target.columnId).toBeUndefined();
  });

  it('drops the duplicated column ids from edge data', () => {
    const edge = v0Edge('e1', 't1', 't2', {
      sourceHandle: 'c1-right',
      data: { sourceColumn: 'c1', isNoteLink: false },
    });

    const migrated = migrateV2toV3(state([tableNode('t1'), tableNode('t2')], [edge])).edges[0];

    expect(migrated.data).not.toHaveProperty('sourceColumn');
    expect(migrated.data).not.toHaveProperty('targetColumn');
  });

  // Column.foreignKey has been in the types since the beginning and TableNode
  // renders an FK badge from it, but nothing ever wrote it.
  it('backfills foreignKey on the referencing column', () => {
    const edge = v0Edge('e1', 'orders', 'users', {
      sourceHandle: 'user_id-right',
      targetHandle: 'id-left',
      data: { isNoteLink: false },
    });

    const migrated = migrateV2toV3(
      state(
        [
          tableNode('orders', {}, [column('user_id')]),
          tableNode('users', {}, [column('id', 'id', { primaryKey: true })]),
        ],
        [edge]
      )
    );

    const orders = migrated.nodes.find((n) => n.id === 'orders') as TableNode;
    expect(orders.data.columns[0].foreignKey).toEqual({ tableId: 'users', columnId: 'id' });

    // The referenced side is not itself a foreign key.
    const users = migrated.nodes.find((n) => n.id === 'users') as TableNode;
    expect(users.data.columns[0].foreignKey).toBeUndefined();
  });

  it('does not backfill from note links', () => {
    const edge = v0Edge('e1', 't1', 'n1', {
      sourceHandle: 'c1-right',
      targetHandle: 'c2-left',
      data: { isNoteLink: true },
    });

    const migrated = migrateV2toV3(
      state([tableNode('t1', {}, [column('c1')]), noteNode('n1')], [edge])
    );

    const t1 = migrated.nodes.find((n) => n.id === 't1') as TableNode;
    expect(t1.data.columns[0].foreignKey).toBeUndefined();
  });
});

// --- Runner -----------------------------------------------------------------

describe('runMigrations', () => {
  // This is the regression the old `if (version === 0) return ...` form caused:
  // v0 data was upgraded to v1 and handed straight back, never reaching v2.
  it('chains every migration for v0 data, not just the first', () => {
    const s = state([tableNode('t1'), noteNode('n1')], [v0Edge('e1', 't1', 'n1')]);

    const migrated = runMigrations(s, 0);

    expect(migrated.edges[0].data.isNoteLink).toBe(true);
    expect(migrated.edges[0].data.pattern).toBe('dashed');
    // ...and it reached v3 too.
    expect(migrated.nodes[0]).toHaveProperty('x');
    expect(migrated.nodes[0]).not.toHaveProperty('position');
  });

  it('applies only the remaining steps for v1 data', () => {
    const edge = v0Edge('e1', 't1', 'n1', { data: { isNoteLink: true } });
    const migrated = runMigrations(state([tableNode('t1'), noteNode('n1')], [edge]), 1);

    expect(migrated.edges[0].data.pattern).toBe('dashed');
  });

  it('still converts the shape for v2 data', () => {
    const edge = v0Edge('e1', 't1', 't2', { data: { isNoteLink: false } });
    const migrated = runMigrations(state([tableNode('t1'), tableNode('t2')], [edge]), 2);

    expect(migrated.edges[0].source).toEqual({ nodeId: 't1' });
    expect(migrated.nodes[0]).toHaveProperty('w');
  });

  it('is a no-op for current-version data', () => {
    const s = state([tableNode('t1')], []);
    expect(runMigrations(s, 3)).toBe(s as never);
  });

  it('is idempotent when the v0 chain is re-run against its own output', () => {
    const s = state([tableNode('t1'), noteNode('n1')], [v0Edge('e1', 't1', 'n1')]);

    const once = runMigrations(s, 0);
    const twice = runMigrations(once as unknown as LegacyPersistedShape, 3);

    expect(twice).toEqual(once);
  });

  it('preserves theme', () => {
    const s: LegacyPersistedShape = {
      nodes: [tableNode('t1')],
      edges: [],
      theme: 'dark',
    };

    expect(runMigrations(s, 0).theme).toBe('dark');
  });
});

describe('assertPersistedShape', () => {
  it('defaults a missing theme rather than failing', () => {
    expect(assertPersistedShape({ nodes: [], edges: [] }).theme).toBe('system');
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an object with no arrays', { nodes: 'x', edges: 1 }],
    ['an object missing edges', { nodes: [] }],
  ])('rejects %s', (_label, value) => {
    expect(() => assertPersistedShape(value)).toThrow();
  });
});

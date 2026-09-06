import { describe, expect, it } from 'vitest';
import type { Column, DBNode, TableNode, TableNodeData } from '@/types';
import {
  METRICS,
  columnPort,
  columnRect,
  diagramBounds,
  inflate,
  intrinsicTableHeight,
  intrinsicTableSize,
  nodePort,
  nodeRect,
  pointInRect,
  rectsIntersect,
  tableHeaderH,
  tableRowAt,
  tableRowRect,
  unionBBox,
  type TextMeasurer,
} from './geometry';

/** Deterministic stand-in for canvas text metrics: 6px per character. */
const measurer: TextMeasurer = { measure: (text) => text.length * 6 };

function column(id: string, over: Partial<Column> = {}): Column {
  return {
    id,
    name: id,
    dataType: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...over,
  };
}

function table(over: Partial<TableNode> = {}, data: Partial<TableNodeData> = {}): TableNode {
  const tableData: TableNodeData = {
    type: 'table',
    name: 'users',
    columns: [column('c1'), column('c2'), column('c3')],
    ...data,
  };

  return {
    id: 't1',
    type: 'table',
    x: 100,
    y: 200,
    w: 260,
    h: intrinsicTableHeight(tableData),
    z: 1,
    data: tableData,
    ...over,
  };
}

describe('rect helpers', () => {
  it('detects containment, edges included', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(pointInRect({ x: 5, y: 5 }, r)).toBe(true);
    expect(pointInRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);
    expect(pointInRect({ x: 11, y: 5 }, r)).toBe(false);
    expect(pointInRect({ x: 5, y: -1 }, r)).toBe(false);
  });

  it('detects overlap but not mere touching', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 20, y: 20, w: 1, h: 1 })).toBe(false);
  });

  it('inflates on every side', () => {
    expect(inflate({ x: 10, y: 10, w: 5, h: 5 }, 2)).toEqual({ x: 8, y: 8, w: 9, h: 9 });
  });

  it('shrinks with a negative amount', () => {
    expect(inflate({ x: 10, y: 10, w: 10, h: 10 }, -2)).toEqual({ x: 12, y: 12, w: 6, h: 6 });
  });

  it('unions rects', () => {
    expect(
      unionBBox([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 50, y: 20, w: 10, h: 10 },
      ])
    ).toEqual({ x: 0, y: 0, w: 60, h: 30 });
  });

  it('handles negative coordinates in a union', () => {
    expect(
      unionBBox([
        { x: -30, y: -10, w: 10, h: 10 },
        { x: 10, y: 10, w: 10, h: 10 },
      ])
    ).toEqual({ x: -30, y: -10, w: 50, h: 30 });
  });

  it('returns an empty rect for no input rather than Infinity', () => {
    expect(unionBBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('table height', () => {
  it('is header plus one row per column', () => {
    expect(intrinsicTableHeight(table().data)).toBe(METRICS.headerH + 3 * METRICS.rowH);
  });

  it('reserves a placeholder row for a table with no columns', () => {
    const data = table({}, { columns: [] }).data;
    expect(intrinsicTableHeight(data)).toBe(METRICS.headerH + METRICS.emptyRowH);
  });

  it('adds a band for a comment', () => {
    const withComment = table({}, { comment: 'ledger' }).data;
    expect(intrinsicTableHeight(withComment)).toBe(
      METRICS.headerH + METRICS.headerCommentH + 3 * METRICS.rowH
    );
  });

  it('grows by exactly one row per added column', () => {
    const three = intrinsicTableHeight(table().data);
    const four = intrinsicTableHeight(table({}, { columns: [column('a'), column('b'), column('c'), column('d')] }).data);
    expect(four - three).toBe(METRICS.rowH);
  });
});

describe('intrinsicTableSize', () => {
  it('never goes below the minimum width', () => {
    const data = table({}, { name: 'a', columns: [column('b')] }).data;
    expect(intrinsicTableSize(data, measurer).w).toBe(METRICS.minW);
  });

  it('never exceeds the maximum width', () => {
    const long = 'x'.repeat(500);
    const data = table({}, { name: long, columns: [column(long)] }).data;
    expect(intrinsicTableSize(data, measurer).w).toBe(METRICS.maxW);
  });

  it('widens for a longer column name', () => {
    const narrow = intrinsicTableSize(table({}, { columns: [column('id')] }).data, measurer);
    const wide = intrinsicTableSize(
      table({}, { columns: [column('a_very_long_column_name_here')] }).data,
      measurer
    );
    expect(wide.w).toBeGreaterThan(narrow.w);
  });

  it('reserves room for primary key and unique indicators', () => {
    // Long enough that both sides clear minW, or the clamp would hide the difference.
    const name = 'a_column_name_long_enough_to_matter';

    const plain = intrinsicTableSize(table({}, { columns: [column(name)] }).data, measurer);
    const decorated = intrinsicTableSize(
      table({}, { columns: [column(name, { primaryKey: true, unique: true })] }).data,
      measurer
    );

    expect(plain.w).toBeGreaterThan(METRICS.minW);
    expect(decorated.w).toBeGreaterThan(plain.w);
  });

  it('reports the derived height', () => {
    const data = table().data;
    expect(intrinsicTableSize(data, measurer).h).toBe(intrinsicTableHeight(data));
  });
});

describe('row geometry', () => {
  it('stacks rows below the header', () => {
    const t = table();
    const first = tableRowRect(t, 0);

    expect(first.y).toBe(t.y + METRICS.headerH);
    expect(first.x).toBe(t.x);
    expect(first.w).toBe(t.w);
    expect(first.h).toBe(METRICS.rowH);
  });

  it('offsets each subsequent row by one row height', () => {
    const t = table();
    expect(tableRowRect(t, 2).y - tableRowRect(t, 1).y).toBe(METRICS.rowH);
  });

  it('pushes rows down when the table has a comment', () => {
    const plain = table();
    const commented = table({}, { comment: 'ledger' });

    expect(tableRowRect(commented, 0).y - tableRowRect(plain, 0).y).toBe(METRICS.headerCommentH);
    expect(tableHeaderH(commented.data)).toBe(METRICS.headerH + METRICS.headerCommentH);
  });

  it('locates a column by id', () => {
    const t = table();
    expect(columnRect(t, 'c2')).toEqual(tableRowRect(t, 1));
  });

  it('returns null for a column that is not in the table', () => {
    expect(columnRect(table(), 'nope')).toBeNull();
  });
});

describe('tableRowAt', () => {
  const t = table();

  it('finds the column under a point', () => {
    const target = tableRowRect(t, 1);
    expect(tableRowAt(t, { x: target.x + 5, y: target.y + 5 })?.id).toBe('c2');
  });

  it('returns null over the header', () => {
    expect(tableRowAt(t, { x: t.x + 5, y: t.y + 5 })).toBeNull();
  });

  it('returns null outside the table', () => {
    expect(tableRowAt(t, { x: t.x - 50, y: t.y + 50 })).toBeNull();
  });

  it('returns null below the last row', () => {
    expect(tableRowAt(t, { x: t.x + 5, y: t.y + t.h + 10 })).toBeNull();
  });
});

describe('ports', () => {
  const t = table();

  it('puts node ports at the midpoint of each side', () => {
    expect(nodePort(t, 'left')).toEqual({ x: t.x, y: t.y + t.h / 2 });
    expect(nodePort(t, 'right')).toEqual({ x: t.x + t.w, y: t.y + t.h / 2 });
    expect(nodePort(t, 'top')).toEqual({ x: t.x + t.w / 2, y: t.y });
    expect(nodePort(t, 'bottom')).toEqual({ x: t.x + t.w / 2, y: t.y + t.h });
  });

  it('centres a column port on its row', () => {
    const row = tableRowRect(t, 1);

    expect(columnPort(t, 'c2', 'left')).toEqual({ x: t.x, y: row.y + METRICS.rowH / 2 });
    expect(columnPort(t, 'c2', 'right')).toEqual({ x: t.x + t.w, y: row.y + METRICS.rowH / 2 });
  });

  it('keeps ports for different columns distinct', () => {
    expect(columnPort(t, 'c1', 'left')).not.toEqual(columnPort(t, 'c2', 'left'));
  });

  it('falls back to the node port for top and bottom, since a row has no top edge', () => {
    expect(columnPort(t, 'c2', 'top')).toEqual(nodePort(t, 'top'));
    expect(columnPort(t, 'c2', 'bottom')).toEqual(nodePort(t, 'bottom'));
  });

  it('returns null for a column that is not in the table', () => {
    expect(columnPort(t, 'missing', 'left')).toBeNull();
  });

  it('tracks the table when it moves', () => {
    const moved = table({ x: 1000, y: 2000 });
    const before = columnPort(t, 'c2', 'right');
    const after = columnPort(moved, 'c2', 'right');

    expect(after!.x - before!.x).toBe(900);
    expect(after!.y - before!.y).toBe(1800);
  });
});

describe('diagramBounds', () => {
  it('spans every node', () => {
    const nodes: DBNode[] = [
      table({ id: 'a', x: 0, y: 0 }),
      table({ id: 'b', x: 500, y: 300 }),
    ];

    const bounds = diagramBounds(nodes);

    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.w).toBe(500 + nodes[1].w);
    expect(bounds.h).toBe(300 + nodes[1].h);
  });

  it('is empty for an empty diagram', () => {
    expect(diagramBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('matches nodeRect for a single node', () => {
    const t = table();
    expect(diagramBounds([t])).toEqual(nodeRect(t));
  });
});

import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight } from '../geometry';
import type { DBEdge, DBNode, TableNodeData } from '@/types';
import { DEFAULT_LAYOUT, gridLayout, layeredLayout, layoutBounds } from './layered';

function table(id: string, x = 0, y = 0, columns = 3): DBNode {
  const data: TableNodeData = {
    type: 'table',
    name: id,
    columns: Array.from({ length: columns }, (_, i) => ({
      id: `${id}.c${i}`,
      name: `c${i}`,
      dataType: 'INT' as const,
      nullable: false,
      primaryKey: i === 0,
      unique: i === 0,
      autoIncrement: false,
    })),
  };

  return { id, type: 'table', x, y, w: 240, h: intrinsicTableHeight(data), z: 1, data };
}

function link(from: string, to: string, isNoteLink = false): DBEdge {
  return {
    id: `${from}->${to}`,
    source: { nodeId: from, columnId: `${from}.c1` },
    target: { nodeId: to, columnId: `${to}.c0` },
    data: { type: 'relationship', isNoteLink },
  };
}

/** No two laid-out nodes may overlap. */
function assertNoOverlap(positions: Map<string, { x: number; y: number }>, nodes: DBNode[]) {
  const placed = nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({ id: n.id, ...positions.get(n.id)!, w: n.w, h: n.h }));

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const overlap =
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe('layeredLayout', () => {
  it('returns nothing for an empty diagram', () => {
    expect(layeredLayout([], []).size).toBe(0);
  });

  it('places every table', () => {
    const nodes = [table('a'), table('b'), table('c')];
    const positions = layeredLayout(nodes, [link('a', 'b'), link('b', 'c')]);

    expect(positions.size).toBe(3);
  });

  it('puts a referencing table in an earlier rank than what it references', () => {
    const nodes = [table('a'), table('b'), table('c')];
    const positions = layeredLayout(nodes, [link('a', 'b'), link('b', 'c')]);

    // Left to right by default: a -> b -> c.
    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x);
    expect(positions.get('b')!.x).toBeLessThan(positions.get('c')!.x);
  });

  it('lays out top to bottom when asked', () => {
    const nodes = [table('a'), table('b')];
    const positions = layeredLayout(nodes, [link('a', 'b')], { direction: 'TB' });

    expect(positions.get('a')!.y).toBeLessThan(positions.get('b')!.y);
  });

  it('never overlaps two tables', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => table(`t${i}`));
    const edges = [
      link('t0', 't1'), link('t0', 't2'), link('t1', 't3'), link('t2', 't3'),
      link('t3', 't4'), link('t4', 't5'), link('t5', 't6'), link('t2', 't7'),
      link('t7', 't8'), link('t8', 't9'), link('t9', 't10'), link('t6', 't11'),
    ];

    const positions = layeredLayout(nodes, edges);
    assertNoOverlap(positions, nodes);
  });

  it('stacks unrelated tables within one rank rather than piling them up', () => {
    const nodes = [table('a'), table('b'), table('c')];
    const positions = layeredLayout(nodes, []);

    const ys = new Set(['a', 'b', 'c'].map((id) => positions.get(id)!.y));
    expect(ys.size).toBe(3);
    assertNoOverlap(positions, nodes);
  });

  /** Schemas cycle constantly; ranking is only defined on a DAG. */
  it('handles a cycle without hanging', () => {
    const nodes = [table('a'), table('b'), table('c')];
    const positions = layeredLayout(nodes, [link('a', 'b'), link('b', 'c'), link('c', 'a')]);

    expect(positions.size).toBe(3);
    assertNoOverlap(positions, nodes);
  });

  it('handles a self-reference', () => {
    const nodes = [table('a'), table('b')];
    const positions = layeredLayout(nodes, [link('a', 'a'), link('a', 'b')]);

    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x);
  });

  it('ignores note links when ranking', () => {
    const nodes = [table('a'), table('b')];

    const withNote = layeredLayout(nodes, [link('a', 'b'), link('b', 'a', true)]);
    const without = layeredLayout(nodes, [link('a', 'b')]);

    expect(withNote.get('b')).toEqual(without.get('b'));
  });

  it('is deterministic', () => {
    const nodes = [table('a'), table('b'), table('c'), table('d')];
    const edges = [link('a', 'b'), link('a', 'c'), link('b', 'd'), link('c', 'd')];

    expect(layeredLayout(nodes, edges)).toEqual(layeredLayout(nodes, edges));
  });

  it('snaps every position to the canvas grid', () => {
    const nodes = [table('a', 7, 13), table('b', 101, 203)];
    const positions = layeredLayout(nodes, [link('a', 'b')]);

    for (const p of positions.values()) {
      expect(p.x % 15).toBe(0);
      expect(p.y % 15).toBe(0);
    }
  });

  it('keeps the diagram roughly where it was rather than jumping to the origin', () => {
    const nodes = [table('a', 5000, 5000), table('b', 5400, 5000)];
    const positions = layeredLayout(nodes, [link('a', 'b')]);

    expect(positions.get('a')!.x).toBeGreaterThan(4000);
    expect(positions.get('a')!.y).toBeGreaterThan(4000);
  });

  it('leaves groups alone, since they are regions rather than nodes', () => {
    const group: DBNode = {
      id: 'g', type: 'group', x: 0, y: 0, w: 400, h: 300, z: 0,
      data: { type: 'group', name: 'G' },
    };
    const positions = layeredLayout([group, table('a'), table('b')], [link('a', 'b')]);

    expect(positions.has('g')).toBe(false);
  });

  it('parks a note beside the table it annotates', () => {
    const nodes: DBNode[] = [
      table('a'),
      { id: 'n', type: 'note', x: 9999, y: 9999, w: 200, h: 120, z: 2,
        data: { type: 'note', name: 'N', content: '' } },
    ];
    const noteLink: DBEdge = {
      id: 'nl',
      source: { nodeId: 'n' },
      target: { nodeId: 'a' },
      data: { type: 'relationship', isNoteLink: true },
    };

    const positions = layeredLayout(nodes, [noteLink]);
    const note = positions.get('n')!;
    const anchor = positions.get('a')!;

    expect(note.x).toBeGreaterThan(anchor.x);
    expect(Math.abs(note.y - anchor.y)).toBeLessThan(50);
  });

  it('lays out only the requested subset', () => {
    const nodes = [table('a'), table('b', 900, 900), table('c', 1800, 1800)];
    const positions = layeredLayout(nodes, [link('a', 'b')], { only: new Set(['a', 'b']) });

    expect(positions.has('c')).toBe(false);
    expect(positions.size).toBe(2);
  });

  it('separates ranks by roughly the configured gap', () => {
    const nodes = [table('a'), table('b')];
    const positions = layeredLayout(nodes, [link('a', 'b')]);

    const gap = positions.get('b')!.x - positions.get('a')!.x - nodes[0].w;
    expect(gap).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.rankSep - 15);
  });
});

describe('gridLayout', () => {
  it('arranges nodes without overlap', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => table(`t${i}`));
    const positions = gridLayout(nodes);

    expect(positions.size).toBe(7);
    assertNoOverlap(positions, nodes);
  });

  it('wraps at the requested column count', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => table(`t${i}`));
    const positions = gridLayout(nodes, { columns: 3 });

    expect(positions.get('t0')!.y).toBe(positions.get('t2')!.y);
    expect(positions.get('t3')!.y).toBeGreaterThan(positions.get('t0')!.y);
  });

  it('skips groups', () => {
    const group: DBNode = {
      id: 'g', type: 'group', x: 0, y: 0, w: 400, h: 300, z: 0,
      data: { type: 'group', name: 'G' },
    };

    expect(gridLayout([group, table('a')]).has('g')).toBe(false);
  });

  it('returns nothing for an empty diagram', () => {
    expect(gridLayout([]).size).toBe(0);
  });
});

describe('layoutBounds', () => {
  it('spans the laid-out nodes', () => {
    const nodes = [table('a'), table('b')];
    const positions = layeredLayout(nodes, [link('a', 'b')]);
    const bounds = layoutBounds(positions, nodes);

    expect(bounds.w).toBeGreaterThan(nodes[0].w);
    expect(bounds.h).toBeGreaterThan(0);
  });

  it('is empty when nothing was laid out', () => {
    expect(layoutBounds(new Map(), [table('a')])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

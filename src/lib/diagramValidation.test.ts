import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight } from '@/engine/geometry';
import type { DBNode, TableNodeData } from '@/types';
import { sanitizeDiagram, validEdge, validNode } from './diagramValidation';

function table(id: string): DBNode {
  const data: TableNodeData = { type: 'table', name: id, columns: [] };
  return { id, type: 'table', x: 0, y: 0, w: 260, h: intrinsicTableHeight(data), z: 1, data };
}

describe('validNode', () => {
  it('accepts a well-formed node', () => {
    expect(validNode(table('a'))).toBe(true);
  });

  it.each([
    ['a non-object', 42],
    ['null', null],
    ['a missing id', { type: 'table', x: 0, y: 0, w: 1, h: 1, data: { type: 'table', columns: [] } }],
    ['an unknown type', { id: 'a', type: 'widget', x: 0, y: 0, w: 1, h: 1, data: { type: 'widget' } }],
    ['missing data', { id: 'a', type: 'group', x: 0, y: 0, w: 1, h: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(validNode(value)).toBe(false);
  });

  /**
   * `node.type` and `node.data.type` are two spellings of one fact. Code narrows
   * on the first and reads fields off the second, so a record where they
   * disagree passes a naive check and then crashes the renderer.
   */
  it('rejects a node whose two type fields disagree', () => {
    const mismatched = { ...table('a'), data: { type: 'note', name: 'n', content: '' } };
    expect(validNode(mismatched)).toBe(false);
  });

  it('rejects a table whose columns are not an array', () => {
    const broken = { ...table('a'), data: { type: 'table', name: 'a', columns: null } };
    expect(validNode(broken)).toBe(false);
  });

  // NaN propagates through diagramBounds into fitView and blanks the canvas.
  it.each(['x', 'y', 'w', 'h'])('rejects a non-finite %s', (field) => {
    expect(validNode({ ...table('a'), [field]: NaN })).toBe(false);
    expect(validNode({ ...table('a'), [field]: Infinity })).toBe(false);
  });
});

describe('validEdge', () => {
  const ids = new Set(['a', 'b']);
  const good = { id: 'e', source: { nodeId: 'a' }, target: { nodeId: 'b' } };

  it('accepts an edge between known nodes', () => {
    expect(validEdge(good, ids)).toBe(true);
  });

  it('rejects an edge to a node that is not present', () => {
    expect(validEdge({ ...good, target: { nodeId: 'ghost' } }, ids)).toBe(false);
  });

  it('rejects a string endpoint, which is the pre-v3 shape', () => {
    expect(validEdge({ id: 'e', source: 'a', target: 'b' }, ids)).toBe(false);
  });
});

describe('sanitizeDiagram', () => {
  it('passes sound data through with no warnings', () => {
    const result = sanitizeDiagram([table('a')], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('drops bad nodes and reports the count', () => {
    const result = sanitizeDiagram([table('a'), { id: 'broken' }], []);

    expect(result.nodes).toHaveLength(1);
    expect(result.warnings[0]).toContain('1 unreadable node');
  });

  // A dropped node has to take its relationships with it, or they dangle.
  it('drops edges orphaned by a dropped node', () => {
    const edges = [{ id: 'e', source: { nodeId: 'a' }, target: { nodeId: 'broken' } }];
    const result = sanitizeDiagram([table('a'), { id: 'broken' }], edges);

    expect(result.edges).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('unreadable relationship'))).toBe(true);
  });
});

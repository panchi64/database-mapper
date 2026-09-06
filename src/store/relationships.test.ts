// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { TableNode } from '@/types';
import { useStore } from './useStore';

const at = { x: 0, y: 0 };
const s = () => useStore.getState();

function reset() {
  localStorage.clear();
  useStore.setState({
    nodes: [],
    edges: [],
    past: [],
    future: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: new Set(),
  });
}

/** A table plus the id of its single default `id` column. */
function makeTable() {
  const nodeId = s().addTable(at);
  const node = s().nodes.find((n) => n.id === nodeId) as TableNode;
  return { nodeId, columnId: node.data.columns[0].id };
}

function tableById(id: string): TableNode {
  return s().nodes.find((n) => n.id === id) as TableNode;
}

describe('createRelationship', () => {
  beforeEach(reset);

  it('connects two tables and returns the new edge id', () => {
    const a = makeTable();
    const b = makeTable();

    const id = s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: b.nodeId, columnId: b.columnId },
    });

    expect(id).toBeTruthy();
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0].source).toEqual({ nodeId: a.nodeId, columnId: a.columnId });
  });

  it('defaults to one-to-many', () => {
    const a = makeTable();
    const b = makeTable();

    s().createRelationship({ source: { nodeId: a.nodeId }, target: { nodeId: b.nodeId } });

    expect(s().edges[0].data.cardinality).toBe('one-to-many');
  });

  it('honours an explicit cardinality and label', () => {
    const a = makeTable();
    const b = makeTable();

    s().createRelationship({
      source: { nodeId: a.nodeId },
      target: { nodeId: b.nodeId },
      cardinality: 'many-to-many',
      label: 'tags',
    });

    expect(s().edges[0].data).toMatchObject({ cardinality: 'many-to-many', label: 'tags' });
  });

  it('rejects an unknown node', () => {
    const a = makeTable();

    expect(
      s().createRelationship({ source: { nodeId: a.nodeId }, target: { nodeId: 'ghost' } })
    ).toBeNull();
    expect(s().edges).toHaveLength(0);
  });

  it('rejects a column pointing at itself', () => {
    const a = makeTable();

    const id = s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: a.nodeId, columnId: a.columnId },
    });

    expect(id).toBeNull();
    expect(s().edges).toHaveLength(0);
  });

  it('allows a self-referencing table across two different columns', () => {
    const a = makeTable();
    s().addColumn(a.nodeId);
    const second = tableById(a.nodeId).data.columns[1].id;

    const id = s().createRelationship({
      source: { nodeId: a.nodeId, columnId: second },
      target: { nodeId: a.nodeId, columnId: a.columnId },
    });

    expect(id).toBeTruthy();
  });

  it('rejects a duplicate of the same endpoint pair', () => {
    const a = makeTable();
    const b = makeTable();
    const input = {
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: b.nodeId, columnId: b.columnId },
    };

    s().createRelationship(input);
    expect(s().createRelationship(input)).toBeNull();
    expect(s().edges).toHaveLength(1);
  });

  it('flags a link to a note and dashes it', () => {
    const a = makeTable();
    const noteId = s().addNote(at);

    s().createRelationship({ source: { nodeId: a.nodeId }, target: { nodeId: noteId } });

    expect(s().edges[0].data).toMatchObject({ isNoteLink: true, pattern: 'dashed' });
  });

  it('is undoable', () => {
    const a = makeTable();
    const b = makeTable();
    s().createRelationship({ source: { nodeId: a.nodeId }, target: { nodeId: b.nodeId } });

    s().undo();

    expect(s().edges).toHaveLength(0);
  });
});

describe('foreign key sync', () => {
  beforeEach(reset);

  it('writes foreignKey onto the referencing column', () => {
    const orders = makeTable();
    const users = makeTable();

    s().createRelationship({
      source: { nodeId: orders.nodeId, columnId: orders.columnId },
      target: { nodeId: users.nodeId, columnId: users.columnId },
    });

    expect(tableById(orders.nodeId).data.columns[0].foreignKey).toEqual({
      tableId: users.nodeId,
      columnId: users.columnId,
    });
  });

  it('leaves the referenced column alone', () => {
    const orders = makeTable();
    const users = makeTable();

    s().createRelationship({
      source: { nodeId: orders.nodeId, columnId: orders.columnId },
      target: { nodeId: users.nodeId, columnId: users.columnId },
    });

    expect(tableById(users.nodeId).data.columns[0].foreignKey).toBeUndefined();
  });

  it('clears foreignKey when the edge is deleted', () => {
    const orders = makeTable();
    const users = makeTable();
    const edgeId = s().createRelationship({
      source: { nodeId: orders.nodeId, columnId: orders.columnId },
      target: { nodeId: users.nodeId, columnId: users.columnId },
    })!;

    s().deleteEdge(edgeId);

    expect(tableById(orders.nodeId).data.columns[0].foreignKey).toBeUndefined();
  });

  it('follows the edge when it is rewired to another column', () => {
    const orders = makeTable();
    const users = makeTable();
    s().addColumn(users.nodeId);
    const otherColumn = tableById(users.nodeId).data.columns[1].id;

    const edgeId = s().createRelationship({
      source: { nodeId: orders.nodeId, columnId: orders.columnId },
      target: { nodeId: users.nodeId, columnId: users.columnId },
    })!;

    s().updateEdgeColumns(edgeId, orders.columnId, otherColumn);

    expect(tableById(orders.nodeId).data.columns[0].foreignKey).toEqual({
      tableId: users.nodeId,
      columnId: otherColumn,
    });
  });

  it('does not create a foreign key from a note link', () => {
    const a = makeTable();
    const noteId = s().addNote(at);

    s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: noteId },
    });

    expect(tableById(a.nodeId).data.columns[0].foreignKey).toBeUndefined();
  });
});

describe('cascade on delete', () => {
  beforeEach(reset);

  it('removes edges anchored to a deleted column', () => {
    const a = makeTable();
    const b = makeTable();
    s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: b.nodeId, columnId: b.columnId },
    });

    s().deleteColumn(a.nodeId, a.columnId);

    expect(s().edges).toHaveLength(0);
  });

  it('removes an edge when the deleted column is the target end', () => {
    const a = makeTable();
    const b = makeTable();
    s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: b.nodeId, columnId: b.columnId },
    });

    s().deleteColumn(b.nodeId, b.columnId);

    expect(s().edges).toHaveLength(0);
  });

  it('keeps edges anchored to other columns', () => {
    const a = makeTable();
    const b = makeTable();
    s().addColumn(a.nodeId);
    const spare = tableById(a.nodeId).data.columns[1].id;

    s().createRelationship({
      source: { nodeId: a.nodeId, columnId: a.columnId },
      target: { nodeId: b.nodeId, columnId: b.columnId },
    });

    s().deleteColumn(a.nodeId, spare);

    expect(s().edges).toHaveLength(1);
  });

  it('removes every edge touching a deleted node', () => {
    const a = makeTable();
    const b = makeTable();
    const c = makeTable();
    s().createRelationship({ source: { nodeId: a.nodeId }, target: { nodeId: b.nodeId } });
    s().createRelationship({ source: { nodeId: b.nodeId }, target: { nodeId: c.nodeId } });

    s().deleteNode(b.nodeId);

    expect(s().edges).toHaveLength(0);
    expect(s().nodes).toHaveLength(2);
  });
});

describe('table auto-sizing', () => {
  beforeEach(reset);

  it('grows when a column is added', () => {
    const a = makeTable();
    const before = tableById(a.nodeId).h;

    s().addColumn(a.nodeId);

    expect(tableById(a.nodeId).h).toBeGreaterThan(before);
  });

  it('shrinks when a column is removed', () => {
    const a = makeTable();
    s().addColumn(a.nodeId);
    const before = tableById(a.nodeId).h;

    s().deleteColumn(a.nodeId, tableById(a.nodeId).data.columns[1].id);

    expect(tableById(a.nodeId).h).toBeLessThan(before);
  });

  it('grows when a comment is added', () => {
    const a = makeTable();
    const before = tableById(a.nodeId).h;

    s().updateTableComment(a.nodeId, 'ledger of orders');

    expect(tableById(a.nodeId).h).toBeGreaterThan(before);
  });
});

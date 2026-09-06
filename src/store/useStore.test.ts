// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { METRICS } from '@/engine/geometry';
import { useStore } from './useStore';

const at = { x: 0, y: 0 };

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

const s = () => useStore.getState();
const tableCount = () => s().nodes.length;

describe('undo / redo', () => {
  beforeEach(reset);

  it('starts with nothing to undo or redo', () => {
    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(false);
  });

  // The old single-array-plus-cursor implementation only ever recorded
  // pre-mutation states, so `undo` read one entry too far back and the first
  // press reverted two edits at once.
  it('reverts exactly one edit on the first undo', () => {
    s().addTable(at);
    s().addTable(at);
    expect(tableCount()).toBe(2);

    s().undo();

    expect(tableCount()).toBe(1);
  });

  it('walks back one edit at a time', () => {
    s().addTable(at);
    s().addTable(at);
    s().addTable(at);

    s().undo();
    expect(tableCount()).toBe(2);
    s().undo();
    expect(tableCount()).toBe(1);
    s().undo();
    expect(tableCount()).toBe(0);
  });

  it('stops cleanly at the beginning of history', () => {
    s().addTable(at);

    s().undo();
    expect(tableCount()).toBe(0);

    s().undo(); // no-op
    expect(tableCount()).toBe(0);
    expect(s().canUndo()).toBe(false);
  });

  it('redoes what it undid', () => {
    s().addTable(at);
    s().addTable(at);

    s().undo();
    s().undo();
    expect(tableCount()).toBe(0);

    s().redo();
    expect(tableCount()).toBe(1);
    s().redo();
    expect(tableCount()).toBe(2);
  });

  it('stops cleanly at the end of history', () => {
    s().addTable(at);
    s().undo();
    s().redo();

    s().redo(); // no-op
    expect(tableCount()).toBe(1);
    expect(s().canRedo()).toBe(false);
  });

  it('round-trips undo/redo back to an identical document', () => {
    const id = s().addTable(at);
    s().updateTableName(id, 'orders');
    const before = structuredClone(s().nodes);

    s().undo();
    s().redo();

    expect(s().nodes).toEqual(before);
  });

  it('drops the redo branch once a new edit lands', () => {
    s().addTable(at);
    s().addTable(at);
    s().undo();
    expect(s().canRedo()).toBe(true);

    s().addTable(at);

    expect(s().canRedo()).toBe(false);
    expect(tableCount()).toBe(2);
  });

  it('tracks canUndo/canRedo across a full cycle', () => {
    expect(s().canUndo()).toBe(false);

    s().addTable(at);
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);

    s().undo();
    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(true);

    s().redo();
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);
  });

  it('caps history at 50 entries and still undoes correctly', () => {
    for (let i = 0; i < 60; i++) s().addTable(at);
    expect(tableCount()).toBe(60);

    expect(s().past.length).toBe(50);

    s().undo();
    expect(tableCount()).toBe(59);
  });

  it('snapshots deeply, so undo is not aliased to live state', () => {
    const id = s().addTable(at);
    s().updateTableName(id, 'first');
    s().updateTableName(id, 'second');

    s().undo();

    const node = s().nodes.find((n) => n.id === id);
    expect(node?.data.type === 'table' && node.data.name).toBe('first');
  });
});

describe('undo across other mutations', () => {
  beforeEach(reset);

  it('undoes a column addition', () => {
    const id = s().addTable(at);
    const initial = s().nodes[0];
    const columnsBefore = initial.data.type === 'table' ? initial.data.columns.length : 0;

    s().addColumn(id);
    s().undo();

    const node = s().nodes.find((n) => n.id === id);
    expect(node?.data.type === 'table' && node.data.columns.length).toBe(columnsBefore);
  });

  it('undoes a node deletion, restoring the node', () => {
    const id = s().addTable(at);
    s().deleteNode(id);
    expect(tableCount()).toBe(0);

    s().undo();

    expect(tableCount()).toBe(1);
    expect(s().nodes[0].id).toBe(id);
  });

  it('undoes clearDiagram', () => {
    s().addTable(at);
    s().addTable(at);
    s().clearDiagram();
    expect(tableCount()).toBe(0);

    s().undo();

    expect(tableCount()).toBe(2);
  });
});

describe('deleteSelected', () => {
  beforeEach(reset);

  it('deletes the single selected node', () => {
    const id = s().addTable(at);
    s().setSelectedNode(id);

    s().deleteSelected();

    expect(tableCount()).toBe(0);
  });

  /**
   * The regression this covers.
   *
   * A marquee selection of more than one node leaves `selectedNodeId` null,
   * because the properties panel only edits one node at a time. `deleteSelected`
   * keyed off `selectedNodeId` alone, so Delete silently did nothing for exactly
   * the case a multi-select exists for.
   */
  it('deletes every node in a multi-selection', () => {
    const a = s().addTable(at);
    const b = s().addTable(at);
    const c = s().addTable(at);
    s().setSelectedNodes([a, b, c]);
    expect(s().selectedNodeId).toBeNull();

    s().deleteSelected();

    expect(tableCount()).toBe(0);
  });

  it('deletes a multi-selection as one undoable step', () => {
    const a = s().addTable(at);
    const b = s().addTable(at);
    s().setSelectedNodes([a, b]);

    s().deleteSelected();
    s().undo();

    expect(tableCount()).toBe(2);
  });

  it('drops the edges of every deleted node', () => {
    const a = s().addTable(at);
    const b = s().addTable(at);
    s().createRelationship({ source: { nodeId: a }, target: { nodeId: b } });
    expect(s().edges).toHaveLength(1);

    s().setSelectedNodes([a, b]);
    s().deleteSelected();

    expect(s().edges).toHaveLength(0);
  });

  it('falls back to the selected edge when no node is selected', () => {
    const a = s().addTable(at);
    const b = s().addTable(at);
    const id = s().createRelationship({ source: { nodeId: a }, target: { nodeId: b } });
    s().setSelectedEdge(id!);

    s().deleteSelected();

    expect(s().edges).toHaveLength(0);
    expect(tableCount()).toBe(2);
  });
});

describe('selection outlives nothing it points at', () => {
  beforeEach(reset);

  it('clears a selection that undo removed', () => {
    const id = s().addTable(at);
    s().setSelectedNode(id);

    s().undo();

    expect(s().selectedNodeId).toBeNull();
    expect([...s().selectedNodeIds]).toEqual([]);
  });

  it('keeps a selection that undo left in place', () => {
    const id = s().addTable(at);
    s().addTable(at);
    s().setSelectedNode(id);

    s().undo();

    expect(s().selectedNodeId).toBe(id);
  });

  it('clears the selection on import', () => {
    const id = s().addTable(at);
    s().setSelectedNode(id);

    s().importDiagram({ nodes: [], edges: [] });

    expect(s().selectedNodeId).toBeNull();
    expect(s().selectedNodeIds.size).toBe(0);
  });

  it('clears the selection on clearDiagram', () => {
    const a = s().addTable(at);
    const b = s().addTable(at);
    s().setSelectedNodes([a, b]);

    s().clearDiagram();

    expect(s().selectedNodeIds.size).toBe(0);
  });
});

describe('resizeNode', () => {
  beforeEach(reset);

  it('never moves a table vertically, since its height is derived', () => {
    const id = s().addTable(at);
    const before = s().nodes[0];

    // What a north-west drag would produce if `y` were honoured.
    s().resizeNode(id, { x: before.x, y: before.y + 60, w: before.w, h: before.h });

    const after = s().nodes[0];
    expect(after.y).toBe(before.y);
    expect(after.h).toBe(before.h);
  });

  it('clamps a table to the maximum width', () => {
    const id = s().addTable(at);
    s().resizeNode(id, { x: 0, y: 0, w: 10_000, h: 500 });

    expect(s().nodes[0].w).toBe(METRICS.maxW);
  });

  it('lets a note go down to its own minimum, not the table one', () => {
    const id = s().addNote(at);
    s().resizeNode(id, { x: 0, y: 0, w: 10, h: 10 });

    expect(s().nodes[0].w).toBe(METRICS.noteMinW);
    expect(s().nodes[0].h).toBe(METRICS.noteMinH);
  });
});

describe('rehydrating corrupt saved state', () => {
  beforeEach(reset);

  /**
   * Saved state used to be cast straight through while imported files were
   * validated per item, so a diagram that would be rejected as a `.json` loaded
   * from localStorage without complaint and then crashed the renderer.
   */
  function seed(state: unknown) {
    localStorage.setItem('db-mapper-storage', JSON.stringify({ version: 3, state }));
  }

  it('drops a node with non-finite geometry rather than blanking the canvas', async () => {
    seed({
      theme: 'system',
      nodes: [
        { id: 'ok', type: 'group', x: 0, y: 0, w: 100, h: 100, z: 0, data: { type: 'group', name: 'G' } },
        { id: 'bad', type: 'group', x: NaN, y: 0, w: 100, h: 100, z: 0, data: { type: 'group', name: 'B' } },
      ],
      edges: [],
    });

    await useStore.persist.rehydrate();

    expect(s().nodes.map((n) => n.id)).toEqual(['ok']);
  });

  it('drops a node whose two type fields disagree', async () => {
    seed({
      theme: 'system',
      nodes: [{ id: 'x', type: 'table', x: 0, y: 0, w: 1, h: 1, z: 1, data: { type: 'note', name: 'n', content: '' } }],
      edges: [],
    });

    await useStore.persist.rehydrate();

    expect(s().nodes).toHaveLength(0);
  });

  // Never silent: the original blob stays recoverable.
  it('backs the original up when it repairs something', async () => {
    seed({
      theme: 'system',
      nodes: [{ id: 'bad', type: 'group', x: NaN, y: 0, w: 1, h: 1, z: 0, data: { type: 'group', name: 'B' } }],
      edges: [],
    });

    await useStore.persist.rehydrate();

    expect(localStorage.getItem('db-mapper-storage-backup')).toBeTruthy();
  });

  it('leaves sound state alone and writes no backup', async () => {
    seed({
      theme: 'system',
      nodes: [{ id: 'ok', type: 'group', x: 0, y: 0, w: 100, h: 100, z: 0, data: { type: 'group', name: 'G' } }],
      edges: [],
    });

    await useStore.persist.rehydrate();

    expect(s().nodes).toHaveLength(1);
    expect(localStorage.getItem('db-mapper-storage-backup')).toBeNull();
  });
});

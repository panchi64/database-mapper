import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight } from '@/engine/geometry';
import type { DBEdge, DBNode, TableNode, TableNodeData } from '@/types';
import {
  DIAGRAM_FILE_VERSION,
  DiagramParseError,
  parseDiagramFile,
  serializeDiagram,
} from './diagramFile';

function table(id: string, x = 0, y = 0): TableNode {
  const data: TableNodeData = {
    type: 'table',
    name: id,
    columns: [
      {
        id: `${id}-c1`,
        name: 'id',
        dataType: 'INT',
        nullable: false,
        primaryKey: true,
        unique: true,
        autoIncrement: true,
      },
    ],
  };

  return { id, type: 'table', x, y, w: 260, h: intrinsicTableHeight(data), z: 1, data };
}

function edge(id: string, source: string, target: string): DBEdge {
  return {
    id,
    source: { nodeId: source, columnId: `${source}-c1` },
    target: { nodeId: target, columnId: `${target}-c1` },
    data: { type: 'relationship', cardinality: 'one-to-many', isNoteLink: false },
  };
}

describe('serializeDiagram', () => {
  it('stamps the app name and format version', () => {
    const file = serializeDiagram({ nodes: [], edges: [] });

    expect(file.app).toBe('db-mapper');
    expect(file.formatVersion).toBe(DIAGRAM_FILE_VERSION);
  });

  // The camera lives outside the store, so a diagram file never carries one.
  it('writes no viewport', () => {
    expect(serializeDiagram({ nodes: [], edges: [] })).not.toHaveProperty('viewport');
  });
});

describe('round trip', () => {
  it('survives serialize -> JSON -> parse unchanged', () => {
    const original = { nodes: [table('a'), table('b', 400)], edges: [edge('e1', 'a', 'b')] };

    const file = JSON.parse(JSON.stringify(serializeDiagram(original)));
    const { diagram, warnings } = parseDiagramFile(file);

    expect(diagram.nodes).toEqual(original.nodes);
    expect(diagram.edges).toEqual(original.edges);
    expect(warnings).toEqual([]);
  });
});

describe('legacy imports', () => {
  /** A file exported by the React Flow build: no version, `position`, handle strings. */
  const legacyFile = {
    nodes: [
      {
        id: 'orders',
        type: 'table',
        position: { x: 100, y: 50 },
        style: { width: 250, height: 200 },
        selected: true,
        dragging: false,
        measured: { width: 250, height: 200 },
        data: {
          type: 'table',
          name: 'orders',
          columns: [
            { id: 'o-user', name: 'user_id', dataType: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
          ],
        },
      },
      {
        id: 'users',
        type: 'table',
        position: { x: 500, y: 50 },
        style: { width: 250, height: 200 },
        data: {
          type: 'table',
          name: 'users',
          columns: [
            { id: 'u-id', name: 'id', dataType: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true },
          ],
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'orders',
        target: 'users',
        sourceHandle: 'o-user-right',
        targetHandle: 'u-id-left',
        type: 'relationship',
        data: { type: 'relationship', cardinality: 'one-to-many' },
      },
    ],
  };

  it('opens an unversioned React Flow export', () => {
    const { diagram, warnings } = parseDiagramFile(legacyFile);

    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.edges).toHaveLength(1);
    expect(warnings.some((w) => w.includes('older diagram format'))).toBe(true);
  });

  it('flattens the geometry', () => {
    const orders = parseDiagramFile(legacyFile).diagram.nodes[0];

    expect(orders).toMatchObject({ x: 100, y: 50, w: 250 });
    expect(orders).not.toHaveProperty('position');
    expect(orders).not.toHaveProperty('selected');
  });

  it('converts handle strings into endpoints', () => {
    const [imported] = parseDiagramFile(legacyFile).diagram.edges;

    expect(imported.source).toMatchObject({ nodeId: 'orders', columnId: 'o-user' });
    expect(imported.target).toMatchObject({ nodeId: 'users', columnId: 'u-id' });
  });

  it('backfills the foreign key so the FK badge finally shows', () => {
    const orders = parseDiagramFile(legacyFile).diagram.nodes[0] as TableNode;

    expect(orders.data.columns[0].foreignKey).toEqual({ tableId: 'users', columnId: 'u-id' });
  });
});

describe('validation', () => {
  it.each([
    ['a number', 42],
    ['null', null],
    ['a string', '{}'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseDiagramFile(value)).toThrow(DiagramParseError);
  });

  it('rejects an object with no nodes/edges arrays', () => {
    expect(() => parseDiagramFile({ app: 'db-mapper' })).toThrow(DiagramParseError);
  });

  it('accepts an empty diagram', () => {
    const { diagram } = parseDiagramFile(serializeDiagram({ nodes: [], edges: [] }));
    expect(diagram).toEqual({ nodes: [], edges: [] });
  });

  it('drops a malformed node and says so, keeping the rest', () => {
    const file = serializeDiagram({ nodes: [table('a')], edges: [] });
    (file.nodes as unknown[]).push({ id: 'broken' });

    const { diagram, warnings } = parseDiagramFile(JSON.parse(JSON.stringify(file)));

    expect(diagram.nodes).toHaveLength(1);
    expect(warnings.some((w) => w.includes('unreadable node'))).toBe(true);
  });

  it('drops an edge pointing at a node that is not in the file', () => {
    const file = serializeDiagram({
      nodes: [table('a')],
      edges: [edge('e1', 'a', 'ghost')],
    });

    const { diagram, warnings } = parseDiagramFile(JSON.parse(JSON.stringify(file)));

    expect(diagram.edges).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unreadable relationship'))).toBe(true);
  });

  // Older files may carry one; it is ignored rather than treated as an error.
  it('ignores a viewport left over in an older file', () => {
    const file = { ...serializeDiagram({ nodes: [], edges: [] }), viewport: { x: 1, y: 2, zoom: 1 } };
    expect(parseDiagramFile(file).diagram).not.toHaveProperty('viewport');
  });

  it('never imports a theme from a file', () => {
    const file = { ...serializeDiagram({ nodes: [], edges: [] }), theme: 'dark' };
    expect(parseDiagramFile(file).diagram).not.toHaveProperty('theme');
  });
});

describe('node type coverage', () => {
  it('keeps groups and notes', () => {
    const nodes: DBNode[] = [
      { id: 'g', type: 'group', x: 0, y: 0, w: 400, h: 300, z: 0, data: { type: 'group', name: 'G' } },
      { id: 'n', type: 'note', x: 0, y: 0, w: 240, h: 160, z: 2, data: { type: 'note', name: 'N', content: 'hi' } },
    ];

    const { diagram } = parseDiagramFile(
      JSON.parse(JSON.stringify(serializeDiagram({ nodes, edges: [] })))
    );

    expect(diagram.nodes.map((n) => n.type)).toEqual(['group', 'note']);
  });
});

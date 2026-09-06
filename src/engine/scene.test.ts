import { describe, expect, it } from 'vitest';
import { METRICS, intrinsicTableHeight, type TextMeasurer } from './geometry';
import { buildScene, lodForZoom, type SceneInput } from './scene';
import { FALLBACK_PALETTE } from './theme';
import { routeEdges } from './routing';
import type { DBEdge, DBNode, TableNode, TableNodeData } from '@/types';

const measurer: TextMeasurer = { measure: (t) => t.length * 6 };
const size = { width: 1000, height: 800 };

function table(id: string, x = 0, y = 0, columns = 2): TableNode {
  const data: TableNodeData = {
    type: 'table',
    name: id,
    columns: Array.from({ length: columns }, (_, i) => ({
      id: `${id}-c${i}`,
      name: `col_${i}`,
      dataType: 'INT' as const,
      nullable: false,
      primaryKey: i === 0,
      unique: i === 0,
      autoIncrement: false,
    })),
  };

  return { id, type: 'table', x, y, w: 260, h: intrinsicTableHeight(data), z: 1, data };
}

function edge(id: string, source: string, target: string): DBEdge {
  return {
    id,
    source: { nodeId: source, columnId: `${source}-c0` },
    target: { nodeId: target, columnId: `${target}-c0` },
    data: { type: 'relationship', cardinality: 'one-to-many', isNoteLink: false },
  };
}

function scene(nodes: DBNode[], edges: DBEdge[], over: Partial<SceneInput> = {}) {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  return buildScene({
    nodes,
    edges,
    routes: routeEdges(edges, nodesById),
    viewport: { x: 0, y: 0, zoom: 1 },
    size,
    palette: FALLBACK_PALETTE,
    measurer,
    selectedNodeIds: new Set(),
    selectedEdgeId: null,
    ...over,
  });
}

describe('level of detail', () => {
  it('switches to compact below the threshold', () => {
    expect(lodForZoom(METRICS.lodCompact - 0.01)).toBe('compact');
    expect(lodForZoom(METRICS.lodCompact)).toBe('full');
    expect(lodForZoom(1)).toBe('full');
  });

  it('draws far fewer primitives when compact', () => {
    const nodes = [table('users', 0, 0, 8)];

    const full = scene(nodes, []).nodes[0];
    const compact = scene(nodes, [], { viewport: { x: 0, y: 0, zoom: 0.2 } }).nodes[0];

    expect(full.lod).toBe('full');
    expect(compact.lod).toBe('compact');
    expect(compact.prims.length).toBeLessThan(full.prims.length);
  });

  it('still shows the table name when compact', () => {
    const compact = scene([table('users')], [], { viewport: { x: 0, y: 0, zoom: 0.2 } }).nodes[0];
    const texts = compact.prims.filter((p) => p.t === 'text').map((p) => (p as { s: string }).s);

    expect(texts).toContain('users');
  });

  it('draws the column names when full', () => {
    const full = scene([table('users')], []).nodes[0];
    const texts = full.prims.filter((p) => p.t === 'text').map((p) => (p as { s: string }).s);

    expect(texts).toContain('col_0');
    expect(texts).toContain('col_1');
  });
});

describe('culling', () => {
  it('includes nodes in view', () => {
    expect(scene([table('a', 100, 100)], []).nodes).toHaveLength(1);
  });

  it('excludes nodes far outside the view', () => {
    expect(scene([table('a', 50_000, 50_000)], []).nodes).toHaveLength(0);
  });

  it('keeps a node just off the edge, so it does not pop in', () => {
    // Within the cull margin, which is a quarter of the visible extent.
    expect(scene([table('a', size.width + 50, 0)], []).nodes).toHaveLength(1);
  });

  it('excludes edges whose whole route is off screen', () => {
    const nodes = [table('a', 40_000, 40_000), table('b', 40_600, 40_000)];
    expect(scene(nodes, [edge('e1', 'a', 'b')]).edges).toHaveLength(0);
  });
});

describe('bands', () => {
  it('separates groups from other nodes so they paint behind', () => {
    const group: DBNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      z: 0,
      data: { type: 'group', name: 'G' },
    };

    const built = scene([group, table('t', 20, 20)], []);

    expect(built.groups.map((g) => g.id)).toEqual(['g']);
    expect(built.nodes.map((n) => n.id)).toEqual(['t']);
  });
});

describe('selection and hover', () => {
  it('adds a ring for a selected node', () => {
    const built = scene([table('a')], [], { selectedNodeIds: new Set(['a']) });
    expect(built.nodes[0].decorations?.length).toBeGreaterThan(0);
  });

  it('adds no decorations for an unselected, unhovered node', () => {
    expect(scene([table('a')], []).nodes[0].decorations).toBeUndefined();
  });

  it('shows ports only on the hovered table', () => {
    const nodes = [table('a', 0, 0, 3), table('b', 600, 0, 3)];
    const built = scene(nodes, [], { hoveredNodeId: 'a' });

    const a = built.nodes.find((n) => n.id === 'a')!;
    const b = built.nodes.find((n) => n.id === 'b')!;

    // Two ports (left and right) per column.
    expect(a.decorations?.filter((p) => p.t === 'circle')).toHaveLength(6);
    expect(b.decorations).toBeUndefined();
  });

  it('hides ports when zoomed out, where they would be sub-pixel', () => {
    const built = scene([table('a', 0, 0, 3)], [], {
      hoveredNodeId: 'a',
      viewport: { x: 0, y: 0, zoom: 0.2 },
    });

    expect(built.nodes[0].decorations?.filter((p) => p.t === 'circle') ?? []).toHaveLength(0);
  });
});

describe('edge focus', () => {
  const nodes = [table('a', 0, 0), table('b', 600, 0), table('c', 0, 400)];
  const edges = [edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bc', 'b', 'c')];

  it('draws every edge when nothing is hovered', () => {
    expect(scene(nodes, edges).edges).toHaveLength(3);
  });

  // Dimming unrelated edges on hover is the cheapest readability win available
  // on a dense diagram, so it is worth pinning down.
  it('dims edges unrelated to the hovered table', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'a' });

    const strokeOf = (id: string) => {
      const drawn = built.edges.find((e) => e.id === id)!;
      const path = drawn.prims.find((p) => p.t === 'path') as { stroke: string };
      return path.stroke;
    };

    expect(strokeOf('ab')).not.toBe(FALLBACK_PALETTE.edgeDimmed);
    expect(strokeOf('ac')).not.toBe(FALLBACK_PALETTE.edgeDimmed);
    expect(strokeOf('bc')).toBe(FALLBACK_PALETTE.edgeDimmed);
  });

  it('never dims the selected edge', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'a', selectedEdgeId: 'bc' });
    const drawn = built.edges.find((e) => e.id === 'bc')!;
    const path = drawn.prims.find((p) => p.t === 'path') as { stroke: string };

    expect(path.stroke).toBe(FALLBACK_PALETTE.edgeSelected);
  });

  it('draws the selected edge last so it is never buried', () => {
    const built = scene(nodes, edges, { selectedEdgeId: 'ab' });
    expect(built.edges[built.edges.length - 1].id).toBe('ab');
  });
});

describe('hovering a group', () => {
  // A group owns no edges of its own. Treating it like a table focused nothing
  // and dimmed the entire diagram, which is the opposite of what hover is for.
  const group: DBNode = {
    id: 'g',
    type: 'group',
    x: -40,
    y: -40,
    w: 700,
    h: 400,
    z: 0,
    data: { type: 'group', name: 'Catalog' },
  };

  const inside = [table('a', 0, 0), table('b', 340, 0)];
  // Outside the group, but still on screen — a culled edge is not drawn at all,
  // which would make the "still dims" assertion pass for the wrong reason.
  const outside = [table('far', 800, 0), table('far2', 800, 460)];
  const nodes = [group, ...inside, ...outside];

  const edges = [
    edge('inner', 'a', 'b'), // both ends inside the group
    edge('crossing', 'b', 'far'), // one end inside
    edge('external', 'far', 'far2'), // neither end inside
  ];

  const strokeOf = (built: ReturnType<typeof scene>, id: string) => {
    const drawn = built.edges.find((e) => e.id === id)!;
    return (drawn.prims.find((p) => p.t === 'path') as { stroke: string }).stroke;
  };

  it('focuses relationships between its members', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'g' });
    expect(strokeOf(built, 'inner')).not.toBe(FALLBACK_PALETTE.edgeDimmed);
  });

  it('focuses relationships that cross its boundary', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'g' });
    expect(strokeOf(built, 'crossing')).not.toBe(FALLBACK_PALETTE.edgeDimmed);
  });

  it('still dims relationships with no member at either end', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'g' });
    expect(strokeOf(built, 'external')).toBe(FALLBACK_PALETTE.edgeDimmed);
  });

  it('does not dim everything, which was the bug', () => {
    const built = scene(nodes, edges, { hoveredNodeId: 'g' });
    const dimmed = built.edges.filter(
      (e) => (e.prims.find((p) => p.t === 'path') as { stroke: string }).stroke ===
        FALLBACK_PALETTE.edgeDimmed
    );

    expect(dimmed.length).toBeLessThan(built.edges.length);
  });

  it('counts a table by its centre, so overhanging the edge still belongs', () => {
    const overhanging = table('edge_case', group.x + group.w - 40, 0);
    const built = scene(
      [group, ...inside, overhanging],
      [edge('overhang', 'edge_case', 'a')],
      { hoveredNodeId: 'g' }
    );

    expect(strokeOf(built, 'overhang')).not.toBe(FALLBACK_PALETTE.edgeDimmed);
  });
});

describe('overlays', () => {
  it('draws the marquee', () => {
    const built = scene([], [], { marquee: { x: 0, y: 0, w: 100, h: 80 } });
    expect(built.overlays.filter((p) => p.t === 'rect')).toHaveLength(1);
  });

  it('draws the in-flight connection', () => {
    const built = scene([], [], {
      pendingConnection: { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    });

    expect(built.overlays.some((p) => p.t === 'line')).toBe(true);
  });

  it('has no overlays at rest', () => {
    expect(scene([table('a')], []).overlays).toEqual([]);
  });
});

describe('grid', () => {
  it('is present at normal zoom', () => {
    expect(scene([], []).grid).not.toBeNull();
  });

  it('is dropped when the cells would be too fine to read', () => {
    expect(scene([], [], { viewport: { x: 0, y: 0, zoom: 0.2 } }).grid).toBeNull();
  });

  it('can be suppressed outright', () => {
    expect(scene([], [], { showGrid: false }).grid).toBeNull();
  });
});

describe('cache keys', () => {
  it('are stable across rebuilds of identical state', () => {
    const nodes = [table('a')];
    expect(scene(nodes, []).nodes[0].cacheKey).toBe(scene(nodes, []).nodes[0].cacheKey);
  });

  it('change when a column is renamed', () => {
    const before = table('a');
    const after = table('a');
    after.data.columns[0] = { ...after.data.columns[0], name: 'renamed' };

    expect(scene([before], []).nodes[0].cacheKey).not.toBe(scene([after], []).nodes[0].cacheKey);
  });

  it('change with the level of detail', () => {
    const nodes = [table('a')];
    const full = scene(nodes, []).nodes[0].cacheKey;
    const compact = scene(nodes, [], { viewport: { x: 0, y: 0, zoom: 0.2 } }).nodes[0].cacheKey;

    expect(full).not.toBe(compact);
  });

  // Selection is drawn as a decoration outside the cached bitmap, so selecting a
  // node must not force it to be re-rasterised.
  it('do not change when a node is merely selected', () => {
    const nodes = [table('a')];
    const plain = scene(nodes, []).nodes[0].cacheKey;
    const selected = scene(nodes, [], { selectedNodeIds: new Set(['a']) }).nodes[0].cacheKey;

    expect(plain).toBe(selected);
  });
});

import { describe, expect, it } from 'vitest';
import { METRICS, columnPort, intrinsicTableHeight, tableRowRect } from './geometry';
import { distanceToRoute, nodesInRect, normalizeRect, pick, type HitTestInput } from './hitTest';
import { routeEdges } from './routing';
import type { DBEdge, DBNode, TableNode, TableNodeData } from '@/types';

function table(id: string, x = 0, y = 0, columns = 3): TableNode {
  const data: TableNodeData = {
    type: 'table',
    name: id,
    columns: Array.from({ length: columns }, (_, i) => ({
      id: `${id}-c${i}`,
      name: `col_${i}`,
      dataType: 'INT' as const,
      nullable: false,
      primaryKey: i === 0,
      unique: false,
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
    data: { type: 'relationship', isNoteLink: false },
  };
}

function input(nodes: DBNode[], edges: DBEdge[] = [], over: Partial<HitTestInput> = {}): HitTestInput {
  return {
    nodes,
    edges,
    routes: routeEdges(edges, new Map(nodes.map((n) => [n.id, n]))),
    zoom: 1,
    ...over,
  };
}

describe('picking nothing', () => {
  it('returns null over empty space', () => {
    expect(pick({ x: -500, y: -500 }, input([table('a')]))).toBeNull();
  });

  it('returns null for an empty diagram', () => {
    expect(pick({ x: 0, y: 0 }, input([]))).toBeNull();
  });
});

describe('picking nodes and rows', () => {
  const t = table('a', 100, 100);

  it('picks the node when over its header', () => {
    expect(pick({ x: 150, y: 110 }, input([t]))).toEqual({ kind: 'node', nodeId: 'a' });
  });

  it('picks the specific column row under the pointer', () => {
    const row = tableRowRect(t, 1);
    const hit = pick({ x: row.x + 100, y: row.y + row.h / 2 }, input([t]));

    expect(hit).toEqual({ kind: 'row', nodeId: 'a', columnId: 'a-c1' });
  });

  it('distinguishes adjacent rows', () => {
    const first = tableRowRect(t, 0);
    const second = tableRowRect(t, 1);

    const a = pick({ x: first.x + 100, y: first.y + 2 }, input([t]));
    const b = pick({ x: second.x + 100, y: second.y + 2 }, input([t]));

    expect(a).not.toEqual(b);
  });

  it('falls back to the node when zoomed out past row detail', () => {
    const row = tableRowRect(t, 1);
    const hit = pick({ x: row.x + 100, y: row.y + row.h / 2 }, input([t], [], { zoom: 0.2 }));

    expect(hit).toEqual({ kind: 'node', nodeId: 'a' });
  });

  it('picks the topmost node when two overlap', () => {
    const under: DBNode = { ...table('under', 100, 100), z: 0 };
    const over: DBNode = { ...table('over', 100, 100), z: 5 };

    const hit = pick({ x: 150, y: 105 }, input([under, over]));

    expect(hit && 'nodeId' in hit && hit.nodeId).toBe('over');
  });
});

describe('picking ports', () => {
  const t = table('a', 100, 100);

  it('picks a column port, which sits on the node border', () => {
    const port = columnPort(t, 'a-c1', 'right')!;
    const hit = pick(port, input([t], [], { activeNodeId: 'a' }));

    expect(hit).toMatchObject({ kind: 'port', nodeId: 'a', columnId: 'a-c1', side: 'right' });
  });

  it('beats the node body underneath it', () => {
    const port = columnPort(t, 'a-c1', 'left')!;
    // A couple of pixels inside the body, still within the port's hit radius.
    const hit = pick({ x: port.x + 3, y: port.y }, input([t], [], { activeNodeId: 'a' }));

    expect(hit?.kind).toBe('port');
  });

  it('is not offered when zoomed out', () => {
    const port = columnPort(t, 'a-c1', 'right')!;
    const hit = pick(port, input([t], [], { activeNodeId: 'a', zoom: 0.2 }));

    expect(hit?.kind).not.toBe('port');
  });

  // Tolerances are specified in screen pixels, so grabbing a port must not get
  // harder as the diagram zooms out.
  it('keeps the same screen-space tolerance at different zooms', () => {
    const port = columnPort(t, 'a-c0', 'right')!;
    const offsetWorld = (METRICS.portHitR - 2) / 0.5;

    const hit = pick(
      { x: port.x + offsetWorld, y: port.y },
      input([t], [], { activeNodeId: 'a', zoom: 0.5 })
    );

    expect(hit?.kind).toBe('port');
  });
});

describe('picking resize handles', () => {
  const t = table('a', 100, 100);

  it('offers a corner on a selected node', () => {
    const hit = pick({ x: 100, y: 100 }, input([t], [], { selectedNodeIds: new Set(['a']) }));
    expect(hit).toEqual({ kind: 'resize', nodeId: 'a', corner: 'nw' });
  });

  it('offers nothing on an unselected node', () => {
    const hit = pick({ x: 100, y: 100 }, input([t]));
    expect(hit?.kind).not.toBe('resize');
  });

  it('identifies each corner', () => {
    const sel = { selectedNodeIds: new Set(['a']) };
    const corners = [
      [{ x: t.x, y: t.y }, 'nw'],
      [{ x: t.x + t.w, y: t.y }, 'ne'],
      [{ x: t.x + t.w, y: t.y + t.h }, 'se'],
      [{ x: t.x, y: t.y + t.h }, 'sw'],
    ] as const;

    for (const [point, corner] of corners) {
      expect(pick(point, input([t], [], sel))).toEqual({ kind: 'resize', nodeId: 'a', corner });
    }
  });
});

describe('picking edges', () => {
  const nodes = [table('a', 0, 0), table('b', 600, 0)];
  const edges = [edge('e1', 'a', 'b')];

  it('picks an edge near its path', () => {
    const routes = routeEdges(edges, new Map(nodes.map((n) => [n.id, n])));
    const route = routes.get('e1')!;

    // Halfway along the first segment: on the path, but clear of the ports at
    // either end, which are a more specific target and rightly win there.
    const mid = {
      x: (route[0].x + route[1].x) / 2,
      y: (route[0].y + route[1].y) / 2,
    };

    expect(pick(mid, input(nodes, edges))).toEqual({ kind: 'edge', edgeId: 'e1' });
  });

  it('prefers a port over an edge that terminates at it', () => {
    const routes = routeEdges(edges, new Map(nodes.map((n) => [n.id, n])));
    const route = routes.get('e1')!;
    const endpoint = route[route.length - 1];

    expect(pick(endpoint, input(nodes, edges))?.kind).toBe('port');
  });

  it('ignores an edge further away than the tolerance', () => {
    expect(pick({ x: 430, y: 300 }, input(nodes, edges))).toBeNull();
  });

  // A relationship passing under a table must not steal that table's click.
  it('loses to a node on top of it', () => {
    const hit = pick({ x: 20, y: 10 }, input(nodes, edges));
    expect(hit?.kind).toBe('node');
  });
});

describe('distanceToRoute', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('is zero on the path', () => {
    expect(distanceToRoute({ x: 50, y: 0 }, route)).toBeCloseTo(0);
  });

  it('measures perpendicular distance from a segment', () => {
    expect(distanceToRoute({ x: 50, y: 10 }, route)).toBeCloseTo(10);
  });

  it('measures from the nearest endpoint past the end of a segment', () => {
    expect(distanceToRoute({ x: -10, y: 0 }, route)).toBeCloseTo(10);
  });

  it('finds the nearest of several segments', () => {
    expect(distanceToRoute({ x: 105, y: 50 }, route)).toBeCloseTo(5);
  });
});

describe('marquee selection', () => {
  const nodes = [table('a', 0, 0), table('b', 600, 0), table('c', 0, 500)];

  it('selects nodes intersecting the rect', () => {
    expect(nodesInRect(nodes, { x: -10, y: -10, w: 300, h: 300 })).toEqual(['a']);
  });

  it('selects several at once', () => {
    expect(nodesInRect(nodes, { x: -10, y: -10, w: 2000, h: 2000 }).sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts partial overlap', () => {
    expect(nodesInRect(nodes, { x: 200, y: 0, w: 100, h: 100 })).toEqual(['a']);
  });

  it('selects nothing for an empty rect in empty space', () => {
    expect(nodesInRect(nodes, { x: 400, y: 400, w: 50, h: 50 })).toEqual([]);
  });

  it('normalises a rect dragged up and to the left', () => {
    expect(normalizeRect({ x: 100, y: 100, w: -60, h: -40 })).toEqual({
      x: 40,
      y: 60,
      w: 60,
      h: 40,
    });
  });

  it('handles a rect dragged down and to the right unchanged', () => {
    const r = { x: 10, y: 10, w: 50, h: 50 };
    expect(normalizeRect(r)).toEqual(r);
  });
});

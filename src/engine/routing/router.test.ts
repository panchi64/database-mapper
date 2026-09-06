import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight, type Point } from '../geometry';
import type { DBEdge, DBNode, TableNode, TableNodeData } from '@/types';
import { LANE_GAP, assignLanes } from './lanes';
import { ObstacleIndex, PAD, obstaclesFor, segmentBlocked } from './obstacles';
import { routeEdges, routingSignature } from './index';

function table(id: string, x: number, y: number, columns = 4): TableNode {
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

function edge(id: string, from: string, to: string, fromCol = 'c1', toCol = 'c0'): DBEdge {
  return {
    id,
    source: { nodeId: from, columnId: `${from}.${fromCol}` },
    target: { nodeId: to, columnId: `${to}.${toCol}` },
    data: { type: 'relationship', cardinality: 'one-to-many', isNoteLink: false },
  };
}

function byId(nodes: DBNode[]): Map<string, DBNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Every point where a route bends or ends. */
function assertOrthogonal(path: Point[]) {
  for (let i = 1; i < path.length; i++) {
    const straight = path[i].x === path[i - 1].x || path[i].y === path[i - 1].y;
    expect(straight, `segment ${i} is not axis-aligned`).toBe(true);
  }
}

/**
 * The headline requirement: a route may not pass through any table.
 *
 * Checked against the *un-inflated* node rects — the padding is there to keep
 * lines visually clear, but crossing the node itself is the actual defect.
 */
function assertAvoidsNodes(path: Point[], nodes: DBNode[]) {
  for (let i = 1; i < path.length; i++) {
    for (const node of nodes) {
      if (node.type === 'group') continue;
      const rect = { x: node.x, y: node.y, w: node.w, h: node.h };
      expect(
        segmentBlocked(path[i - 1], path[i], rect),
        `segment ${i} passes through ${node.id}`
      ).toBe(false);
    }
  }
}

describe('segmentBlocked', () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 };

  it('detects a horizontal crossing', () => {
    expect(segmentBlocked({ x: 0, y: 150 }, { x: 400, y: 150 }, rect)).toBe(true);
  });

  it('detects a vertical crossing', () => {
    expect(segmentBlocked({ x: 200, y: 0 }, { x: 200, y: 400 }, rect)).toBe(true);
  });

  it('allows a segment running along the boundary', () => {
    expect(segmentBlocked({ x: 0, y: 100 }, { x: 400, y: 100 }, rect)).toBe(false);
    expect(segmentBlocked({ x: 0, y: 200 }, { x: 400, y: 200 }, rect)).toBe(false);
  });

  it('allows a segment that stops short', () => {
    expect(segmentBlocked({ x: 0, y: 150 }, { x: 90, y: 150 }, rect)).toBe(false);
  });

  it('allows a segment clear of the rect', () => {
    expect(segmentBlocked({ x: 0, y: 50 }, { x: 400, y: 50 }, rect)).toBe(false);
  });
});

describe('obstacles', () => {
  it('inflates nodes by the padding', () => {
    const [obstacle] = obstaclesFor([table('t', 100, 100)]);
    expect(obstacle.rect.x).toBe(100 - PAD);
    expect(obstacle.rect.w).toBe(240 + PAD * 2);
  });

  it('excludes groups, which are regions rather than solids', () => {
    const group: DBNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      w: 500,
      h: 500,
      z: 0,
      data: { type: 'group', name: 'G' },
    };

    expect(obstaclesFor([group, table('t', 0, 0)]).map((o) => o.id)).toEqual(['t']);
  });

  it('finds obstacles overlapping a query rect', () => {
    const index = new ObstacleIndex(obstaclesFor([table('a', 0, 0), table('b', 900, 900)]));
    expect(index.query({ x: 0, y: 0, w: 100, h: 100 }).map((o) => o.id)).toEqual(['a']);
  });
});

describe('routing around obstacles', () => {
  it('produces an orthogonal path', () => {
    const nodes = [table('a', 0, 0), table('b', 700, 300)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    assertOrthogonal(path);
  });

  it('starts and ends exactly on the column ports', () => {
    const nodes = [table('a', 0, 0), table('b', 700, 0)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    // Source port is on a's right edge, target port on b's left edge.
    expect(path[0].x).toBe(240);
    expect(path[path.length - 1].x).toBe(700);
  });

  it('goes around a table sitting between the two ends', () => {
    const nodes = [table('a', 0, 0), table('blocker', 350, 0), table('b', 700, 0)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    assertOrthogonal(path);
    assertAvoidsNodes(path, nodes);
  });

  /**
   * The specific defect reported: a line reaching a column by passing behind its
   * own table. Happens when the target is to the *left* of the source, so the
   * path has to come all the way round to the target's left edge.
   */
  it('never passes behind the table it connects to', () => {
    const nodes = [table('a', 700, 0), table('b', 0, 0)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    assertOrthogonal(path);
    assertAvoidsNodes(path, nodes);
  });

  it('never passes behind either table when they overlap vertically', () => {
    const nodes = [table('a', 400, 0), table('b', 0, 40)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    assertAvoidsNodes(path, nodes);
  });

  it('routes between two tables stacked directly on top of each other', () => {
    const nodes = [table('a', 0, 0), table('b', 0, 400)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;

    assertOrthogonal(path);
    assertAvoidsNodes(path, nodes);
  });

  it('handles a self-referencing edge without going through its own table', () => {
    const nodes = [table('a', 200, 200)];
    const selfEdge = edge('e', 'a', 'a', 'c2', 'c0');
    const path = routeEdges([selfEdge], byId(nodes)).get('e')!;

    assertOrthogonal(path);
    assertAvoidsNodes(path, nodes);
  });

  it('routes through a dense field without entering any table', () => {
    const nodes: DBNode[] = [];
    for (let i = 0; i < 12; i++) {
      nodes.push(table(`t${i}`, (i % 4) * 320, Math.floor(i / 4) * 260));
    }

    const path = routeEdges([edge('e', 't0', 't11')], byId(nodes)).get('e')!;

    assertOrthogonal(path);
    assertAvoidsNodes(path, nodes);
  });

  it('falls back to a drawable path rather than nothing when the budget runs out', () => {
    const nodes = [table('a', 0, 0), table('b', 700, 300)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes), {
      search: { turnPenalty: 30, maxExpansions: 1, slack: 220 },
    }).get('e')!;

    expect(path.length).toBeGreaterThanOrEqual(2);
    assertOrthogonal(path);
  });

  it('skips an edge whose node is missing rather than throwing', () => {
    const nodes = [table('a', 0, 0)];
    expect(routeEdges([edge('e', 'a', 'ghost')], byId(nodes)).size).toBe(0);
  });
});

describe('waypoints', () => {
  it('passes through a pinned point', () => {
    const nodes = [table('a', 0, 0), table('b', 800, 0)];
    const pinned: DBEdge = { ...edge('e', 'a', 'b'), waypoints: [{ x: 500, y: 400 }] };

    const path = routeEdges([pinned], byId(nodes)).get('e')!;

    expect(path.some((p) => p.x === 500 && p.y === 400)).toBe(true);
    assertOrthogonal(path);
  });

  it('still avoids obstacles on either side of the pin', () => {
    const nodes = [table('a', 0, 0), table('blocker', 350, 300), table('b', 800, 0)];
    const pinned: DBEdge = { ...edge('e', 'a', 'b'), waypoints: [{ x: 400, y: 600 }] };

    const path = routeEdges([pinned], byId(nodes)).get('e')!;
    assertAvoidsNodes(path, nodes);
  });
});

describe('drag fallback', () => {
  it('uses the cheap route for a node being dragged', () => {
    const nodes = [table('a', 0, 0), table('blocker', 350, 0), table('b', 700, 0)];

    const routed = routeEdges([edge('e', 'a', 'b')], byId(nodes)).get('e')!;
    const dragging = routeEdges([edge('e', 'a', 'b')], byId(nodes), {
      movingNodeIds: new Set(['a']),
    }).get('e')!;

    // The cheap route ignores the blocker, so the two differ.
    expect(dragging).not.toEqual(routed);
    assertOrthogonal(dragging);
  });

  it('fast mode skips the search for every edge', () => {
    const nodes = [table('a', 0, 0), table('blocker', 350, 0), table('b', 700, 0)];
    const path = routeEdges([edge('e', 'a', 'b')], byId(nodes), { fast: true }).get('e')!;

    assertOrthogonal(path);
  });
});

describe('lane assignment', () => {
  /**
   * A route shaped the way the router emits them: port, stub, a long interior
   * run, stub, port. Only the interior run at `y` is eligible to be moved — the
   * segments touching a port are pinned there.
   */
  const corridor = (id: string, y: number, portY = 100) => ({
    id,
    path: [
      { x: 0, y: portY }, // port
      { x: 20, y: portY }, // stub
      { x: 20, y }, // down into the corridor
      { x: 380, y }, // the shared run — index 2 to 3
      { x: 380, y: portY }, // back up
      { x: 400, y: portY }, // port
    ],
  });

  /** The y of the interior run, which is the coordinate lanes move. */
  const runY = (path: Point[]) => path[3].y;

  it('leaves a lone route untouched', () => {
    const input = [corridor('a', 300)];
    expect(assignLanes(input).get('a')).toEqual(input[0].path);
  });

  it('separates two routes sharing a corridor', () => {
    const lanes = assignLanes([corridor('a', 300), corridor('b', 300)]);

    const a = lanes.get('a')!;
    const b = lanes.get('b')!;

    expect(runY(a)).not.toBe(runY(b));
    expect(Math.abs(runY(a) - runY(b))).toBeCloseTo(LANE_GAP);
  });

  it('moves both ends of the run together, keeping it straight', () => {
    const lanes = assignLanes([corridor('a', 300), corridor('b', 300)]);
    const a = lanes.get('a')!;

    expect(a[2].y).toBe(a[3].y);
  });

  it('never moves the endpoints, which are pinned to their ports', () => {
    const lanes = assignLanes([corridor('a', 300), corridor('b', 300)]);
    const a = lanes.get('a')!;

    expect(a[0]).toEqual({ x: 0, y: 100 });
    expect(a[a.length - 1]).toEqual({ x: 400, y: 100 });
  });

  it('leaves routes in different corridors alone', () => {
    const lanes = assignLanes([corridor('a', 300), corridor('b', 700)]);
    expect(runY(lanes.get('a')!)).toBe(300);
  });

  it('spreads three routes symmetrically about the corridor', () => {
    const lanes = assignLanes([corridor('a', 300), corridor('b', 300), corridor('c', 300)]);
    const ys = ['a', 'b', 'c'].map((id) => runY(lanes.get(id)!)).sort((m, n) => m - n);

    expect(ys[1]).toBe(300);
    expect(ys[0]).toBeCloseTo(300 - LANE_GAP);
    expect(ys[2]).toBeCloseTo(300 + LANE_GAP);
  });

  it('leaves runs that share a coordinate but not an interval alone', () => {
    const left = { id: 'left', path: [
      { x: 0, y: 100 }, { x: 20, y: 100 }, { x: 20, y: 300 },
      { x: 100, y: 300 }, { x: 100, y: 100 }, { x: 120, y: 100 },
    ] };
    const right = { id: 'right', path: [
      { x: 500, y: 100 }, { x: 520, y: 100 }, { x: 520, y: 300 },
      { x: 600, y: 300 }, { x: 600, y: 100 }, { x: 620, y: 100 },
    ] };

    const lanes = assignLanes([left, right]);

    // Same y, but the x ranges do not overlap, so neither is obscuring the other.
    expect(runY(lanes.get('left')!)).toBe(300);
    expect(runY(lanes.get('right')!)).toBe(300);
  });
});

describe('two relationships between the same pair of tables', () => {
  // The `orders` -> `addresses` shipping/billing case from the fixture: two
  // optimal paths that would otherwise be drawn exactly on top of each other.
  it('does not draw them as a single line', () => {
    const nodes = [table('orders', 0, 0), table('addresses', 700, 0)];
    const edges = [
      edge('ship', 'orders', 'addresses', 'c1', 'c0'),
      edge('bill', 'orders', 'addresses', 'c2', 'c0'),
    ];

    const routes = routeEdges(edges, byId(nodes));
    const ship = routes.get('ship')!;
    const bill = routes.get('bill')!;

    expect(ship).not.toEqual(bill);
  });
});

describe('routingSignature', () => {
  const a = table('a', 0, 0);
  const b = table('b', 600, 0);
  const e = edge('e1', 'a', 'b');

  const sig = (nodes: DBNode[], edges: DBEdge[]) => routingSignature(nodes, edges);

  it('is stable for equal input', () => {
    expect(sig([a, b], [e])).toBe(sig([a, b], [e]));
  });

  /**
   * The point of the signature: a full reroute was being run on *any* store
   * change, and these three are the common ones that cannot move a line.
   */
  it('ignores changes that cannot move a line', () => {
    const before = sig([a, b], [e]);

    const renamed = { ...a, data: { ...a.data, name: 'renamed' } };
    expect(sig([renamed, b], [e])).toBe(before);

    const recoloured = { ...a, data: { ...a.data, color: 'red' } };
    expect(sig([recoloured, b], [e])).toBe(before);

    const labelled: DBEdge = { ...e, data: { ...e.data, label: 'has many' } };
    expect(sig([a, b], [labelled])).toBe(before);
  });

  it('changes when a node moves or resizes', () => {
    const before = sig([a, b], [e]);
    expect(sig([{ ...a, x: 40 }, b], [e])).not.toBe(before);
    expect(sig([{ ...a, w: a.w + 40 }, b], [e])).not.toBe(before);
  });

  // A reorder moves every port below it without touching the node's rect.
  it('changes when columns are reordered', () => {
    const reordered = { ...a, data: { ...a.data, columns: [...a.data.columns].reverse() } };
    expect(sig([reordered, b], [e])).not.toBe(sig([a, b], [e]));
  });

  it('changes when an endpoint is re-anchored or a waypoint is pinned', () => {
    const before = sig([a, b], [e]);

    const moved: DBEdge = { ...e, target: { nodeId: 'b', columnId: 'b.c1' } };
    expect(sig([a, b], [moved])).not.toBe(before);

    const pinned: DBEdge = { ...e, waypoints: [{ x: 300, y: 40 }] };
    expect(sig([a, b], [pinned])).not.toBe(before);
  });
});

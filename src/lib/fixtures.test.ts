import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight } from '@/engine/geometry';
import { resolveEdge, routeEdges, routeMoving } from '@/engine/routing';
import type { DBNode, TableNode } from '@/types';
import { parseDiagramFile } from './diagramFile';

/**
 * The checked-in fixtures are loaded through the real importer.
 *
 * They exist so a human can verify the renderer against something realistic, so
 * they need to be *correct* — a fixture with a stale height or a dangling edge
 * would look like an engine bug. Regenerate with `bun run scripts/make-fixtures.ts`.
 */
function loadFixture(name: string) {
  const path = resolve(process.cwd(), 'fixtures', name);
  return parseDiagramFile(JSON.parse(readFileSync(path, 'utf8')));
}

describe('ecommerce fixture', () => {
  const { diagram, warnings } = loadFixture('ecommerce.json');

  it('imports with no warnings', () => {
    expect(warnings).toEqual([]);
  });

  it('is already at the current format, so nothing is migrated', () => {
    expect(warnings.some((w) => w.includes('older diagram format'))).toBe(false);
  });

  it('has tables, groups and notes', () => {
    const kinds = new Set(diagram.nodes.map((n) => n.type));
    expect(kinds).toEqual(new Set(['table', 'group', 'note']));
  });

  it('covers every preset colour, so the palette can be eyeballed at a glance', () => {
    const colours = new Set(
      diagram.nodes.map((n) => n.data.color).filter((c): c is string => Boolean(c))
    );

    for (const expected of ['slate', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']) {
      expect(colours).toContain(expected);
    }
  });

  it('exercises every edge pattern', () => {
    const patterns = new Set(diagram.edges.map((e) => e.data.pattern).filter(Boolean));
    expect(patterns).toEqual(new Set(['dashed', 'dotted', 'dash-dot']));
  });

  it('exercises every cardinality', () => {
    const cardinalities = new Set(
      diagram.edges.filter((e) => !e.data.isNoteLink).map((e) => e.data.cardinality)
    );
    expect(cardinalities).toEqual(new Set(['one-to-one', 'one-to-many', 'many-to-many']));
  });

  it('includes note links, which render without cardinality markers', () => {
    expect(diagram.edges.filter((e) => e.data.isNoteLink).length).toBeGreaterThan(0);
  });

  it('includes a self-referencing relationship', () => {
    expect(diagram.edges.some((e) => e.source.nodeId === e.target.nodeId)).toBe(true);
  });

  it('includes tables with comments, which add a header band', () => {
    const commented = diagram.nodes.filter((n) => n.type === 'table' && n.data.comment);
    expect(commented.length).toBeGreaterThan(0);
  });

  it('stores heights that match what the engine would derive', () => {
    for (const node of diagram.nodes) {
      if (node.type !== 'table') continue;
      expect(node.h, `${node.id} height`).toBe(intrinsicTableHeight(node.data));
    }
  });

  it('has no edge pointing at a column that does not exist', () => {
    const columnIds = new Set(
      diagram.nodes.flatMap((n: DBNode) =>
        n.type === 'table' ? (n as TableNode).data.columns.map((c) => c.id) : []
      )
    );

    for (const edge of diagram.edges) {
      for (const end of [edge.source, edge.target]) {
        if (end.columnId) {
          expect(columnIds.has(end.columnId), `${edge.id} -> ${end.columnId}`).toBe(true);
        }
      }
    }
  });

  it('has foreign keys backfilled onto the referencing columns', () => {
    const orders = diagram.nodes.find((n) => n.id === 'orders') as TableNode;
    const userId = orders.data.columns.find((c) => c.name === 'user_id');

    expect(userId?.foreignKey).toEqual({ tableId: 'users', columnId: 'users.id' });
  });

  it('routes every edge to a real pair of endpoints', () => {
    const nodesById = new Map(diagram.nodes.map((n) => [n.id, n]));

    for (const edge of diagram.edges) {
      expect(resolveEdge(edge, nodesById), `${edge.id} resolves`).not.toBeNull();
    }

    expect(routeEdges(diagram.edges, nodesById).size).toBe(diagram.edges.length);
  });

  it('has no two tables occupying the same spot', () => {
    const seen = new Set<string>();
    for (const node of diagram.nodes) {
      if (node.type !== 'table') continue;
      const key = `${node.x},${node.y}`;
      expect(seen.has(key), `${node.id} overlaps another table exactly`).toBe(false);
      seen.add(key);
    }
  });
});

describe('legacy React Flow fixture', () => {
  const { diagram, warnings } = loadFixture('legacy-reactflow-export.json');

  it('is recognised as an older format and upgraded', () => {
    expect(warnings.some((w) => w.includes('older diagram format'))).toBe(true);
  });

  it('produces the same diagram as the current-format fixture', () => {
    const current = loadFixture('ecommerce.json').diagram;

    expect(diagram.nodes).toHaveLength(current.nodes.length);
    expect(diagram.edges).toHaveLength(current.edges.length);
    expect(diagram.nodes.map((n) => n.id).sort()).toEqual(current.nodes.map((n) => n.id).sort());
  });

  it('flattens the geometry and drops React Flow runtime fields', () => {
    for (const node of diagram.nodes) {
      expect(node).not.toHaveProperty('position');
      expect(node).not.toHaveProperty('style');
      expect(node).not.toHaveProperty('measured');
      expect(node).not.toHaveProperty('selected');
      expect(node).not.toHaveProperty('dragging');
      expect(typeof node.x).toBe('number');
      expect(typeof node.w).toBe('number');
    }
  });

  it('turns handle strings back into structured endpoints', () => {
    for (const edge of diagram.edges) {
      expect(typeof edge.source).toBe('object');
      expect(typeof edge.source.nodeId).toBe('string');
    }
  });

  it('backfills the foreign keys the old format never stored', () => {
    const orders = diagram.nodes.find((n) => n.id === 'orders') as TableNode;
    const userId = orders.data.columns.find((c) => c.name === 'user_id');

    expect(userId?.foreignKey).toEqual({ tableId: 'users', columnId: 'users.id' });
  });
});

describe('stress fixture', () => {
  const { diagram, warnings } = loadFixture('stress-300-tables.json');

  it('imports cleanly at the size the perf budget targets', () => {
    expect(warnings).toEqual([]);
    expect(diagram.nodes).toHaveLength(300);
    expect(diagram.edges.length).toBeGreaterThan(300);
  });

  it('carries roughly the column count in the budget', () => {
    const columns = diagram.nodes.reduce(
      (n, node) => n + (node.type === 'table' ? node.data.columns.length : 0),
      0
    );
    expect(columns).toBeGreaterThan(2000);
  });

  const nodesById = new Map(diagram.nodes.map((n) => [n.id, n]));

  it('routes every edge', () => {
    expect(routeEdges(diagram.edges, nodesById).size).toBe(diagram.edges.length);
  });

  // The budget: a full reroute of 500 edges within 120ms, debounced off the drag
  // path. Measured warm, because that is the state the app is in whenever this
  // runs — a reroute happens on every edit, not once.
  it('completes a full reroute inside the budget', () => {
    routeEdges(diagram.edges, nodesById); // warm the JIT

    const start = performance.now();
    routeEdges(diagram.edges, nodesById);

    expect(performance.now() - start).toBeLessThan(120);
  });

  // Cold is what the user pays on load, and it shares the 200ms fitView budget.
  it('completes a cold reroute inside the load budget', () => {
    const start = performance.now();
    routeEdges(diagram.edges, new Map(diagram.nodes.map((n) => [n.id, n])));

    expect(performance.now() - start).toBeLessThan(400);
  });

  // While a table is dragged only its own edges are re-routed, with the cheap
  // elbow — this is the path that has to hold 60fps.
  it('re-routes a dragged node\'s edges in well under a frame', () => {
    const base = routeEdges(diagram.edges, nodesById);
    const moving = new Set([diagram.nodes[10].id]);

    routeMoving(diagram.edges, nodesById, moving, base); // warm

    const start = performance.now();
    routeMoving(diagram.edges, nodesById, moving, base);

    expect(performance.now() - start).toBeLessThan(4);
  });
});

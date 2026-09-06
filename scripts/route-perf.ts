/**
 * Measures edge routing against the checked-in fixtures.
 *
 *   bun run scripts/route-perf.ts
 *
 * The budget (see src/engine/CLAUDE.md) is a full reroute of 500 edges within
 * 120ms, debounced off the drag path, with the cheap elbow used while dragging.
 *
 * Reads the fixture JSON directly rather than going through `parseDiagramFile`:
 * the importer pulls in the store, and the routing modules deliberately have no
 * runtime dependency on it.
 */
import { readFileSync } from 'node:fs';
import { routeEdges } from '../src/engine/routing';
import type { DBEdge, DBNode } from '../src/types';

interface Fixture {
  nodes: DBNode[];
  edges: DBEdge[];
}

const BUDGET_MS = 120;
let failed = false;

for (const name of ['ecommerce', 'stress-300-tables']) {
  const fixture = JSON.parse(readFileSync(`fixtures/${name}.json`, 'utf8')) as Fixture;
  const byId = new Map(fixture.nodes.map((n) => [n.id, n]));

  routeEdges(fixture.edges, byId); // warm the JIT

  const t0 = performance.now();
  const routes = routeEdges(fixture.edges, byId);
  const full = performance.now() - t0;

  const t1 = performance.now();
  routeEdges(fixture.edges, byId, { fast: true });
  const fast = performance.now() - t1;

  const bends = [...routes.values()].reduce((n, p) => n + p.length - 2, 0);
  const perEdge = routes.size === 0 ? 0 : bends / routes.size;

  console.log(
    `${name.padEnd(20)} ${String(fixture.edges.length).padStart(4)} edges | ` +
      `full ${full.toFixed(1).padStart(7)}ms | fast ${fast.toFixed(1).padStart(5)}ms | ` +
      `${perEdge.toFixed(1)} bends/edge`
  );

  // The stress fixture is the one the budget is written against.
  if (name.startsWith('stress') && full > BUDGET_MS) {
    console.error(`  OVER BUDGET: ${full.toFixed(1)}ms > ${BUDGET_MS}ms`);
    failed = true;
  }
}

if (failed) process.exit(1);

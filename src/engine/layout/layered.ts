/**
 * Layered ("Sugiyama") auto-layout.
 *
 * Hand-rolled rather than pulling in dagre (~90KB minified) or elkjs (~500KB).
 * The whole app is one HTML file and we just removed 177KB by dropping React
 * Flow; spending half of that back on a layout library for a button would be a
 * poor trade. This is ~250 lines.
 *
 * The classic pipeline, minus one stage:
 *
 *   break cycles -> rank -> order within ranks -> assign coordinates
 *
 * The omitted stage is virtual nodes for edges spanning several ranks. In a
 * general graph drawer they reserve corridors so long edges do not cut through
 * intervening nodes — but our router already avoids obstacles, so the corridors
 * get found at draw time instead. Skipping them costs some elegance in the node
 * placement and saves a substantial amount of code.
 */
import { METRICS, nodeRect, type Point } from '../geometry';
import type { DBEdge, DBNode } from '@/types';

export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  direction: LayoutDirection;
  /** Gap between one rank and the next. */
  rankSep: number;
  /** Gap between neighbours within a rank. */
  nodeSep: number;
  /** Restrict layout to these nodes; others keep their positions. */
  only?: ReadonlySet<string>;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  direction: 'LR',
  rankSep: 140,
  nodeSep: 48,
};

interface Graph {
  ids: string[];
  /** Adjacency after cycle-breaking: `out[a]` holds ids `a` points at. */
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

/**
 * Build a DAG from the table relationships.
 *
 * Note links are excluded — a note is an annotation, and letting one pull a
 * table into a different rank makes the schema harder to read, not easier.
 * Self-references are dropped: they say nothing about ordering.
 */
function buildGraph(ids: readonly string[], edges: readonly DBEdge[]): Graph {
  const present = new Set(ids);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));

  const seen = new Set<string>();

  for (const edge of edges) {
    if (edge.data.isNoteLink) continue;

    const from = edge.source.nodeId;
    const to = edge.target.nodeId;
    if (from === to) continue;
    if (!present.has(from) || !present.has(to)) continue;

    // Parallel relationships between the same pair say the same thing about
    // ordering, so collapse them.
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.get(from)!.push(to);
    incoming.get(to)!.push(from);
  }

  return { ids: [...ids], out, in: incoming };
}

/**
 * Reverse back edges so the graph becomes acyclic.
 *
 * Ranking is only defined on a DAG, and schemas cycle all the time (`users`
 * referencing `teams` referencing `users`). Depth-first: any edge pointing at a
 * node still on the stack closes a loop, so it gets flipped.
 */
function breakCycles(graph: Graph): void {
  const state = new Map<string, 0 | 1 | 2>(); // unvisited / on stack / done

  const visit = (id: string) => {
    state.set(id, 1);

    for (const next of [...graph.out.get(id)!]) {
      const s = state.get(next) ?? 0;

      if (s === 1) {
        // Back edge: reverse it.
        graph.out.set(id, graph.out.get(id)!.filter((n) => n !== next));
        graph.in.set(next, graph.in.get(next)!.filter((n) => n !== id));
        if (!graph.out.get(next)!.includes(id)) {
          graph.out.get(next)!.push(id);
          graph.in.get(id)!.push(next);
        }
        continue;
      }

      if (s === 0) visit(next);
    }

    state.set(id, 2);
  };

  for (const id of graph.ids) {
    if ((state.get(id) ?? 0) === 0) visit(id);
  }
}

/** Longest-path ranking: a node sits one past its deepest predecessor. */
function assignRanks(graph: Graph): Map<string, number> {
  const rank = new Map<string, number>();

  const compute = (id: string, guard: Set<string>): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;

    // `breakCycles` should have made this impossible; the guard is here so a bug
    // there degrades to a slightly worse layout instead of a stack overflow.
    if (guard.has(id)) return 0;
    guard.add(id);

    let best = 0;
    for (const parent of graph.in.get(id) ?? []) {
      best = Math.max(best, compute(parent, guard) + 1);
    }

    guard.delete(id);
    rank.set(id, best);
    return best;
  };

  for (const id of graph.ids) compute(id, new Set());
  return rank;
}

/** Group ids by rank, preserving a stable initial order. */
function groupByRank(graph: Graph, rank: Map<string, number>): string[][] {
  const maxRank = Math.max(0, ...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);

  for (const id of graph.ids) layers[rank.get(id) ?? 0].push(id);
  return layers;
}

/** Mean index of a node's neighbours in the adjacent layer. */
function barycenter(id: string, neighbours: readonly string[], positions: Map<string, number>): number {
  if (neighbours.length === 0) return positions.get(id) ?? 0;

  let total = 0;
  let count = 0;
  for (const n of neighbours) {
    const p = positions.get(n);
    if (p !== undefined) {
      total += p;
      count++;
    }
  }

  return count === 0 ? (positions.get(id) ?? 0) : total / count;
}

/**
 * Reduce edge crossings by repeatedly sorting each layer on the average position
 * of its neighbours in the layer before (then after) it.
 *
 * Four sweeps is the conventional number: crossings drop steeply for the first
 * two and flatten out well before the fourth.
 */
function orderLayers(layers: string[][], graph: Graph): void {
  const positions = new Map<string, number>();
  const reindex = () => {
    layers.forEach((layer) => layer.forEach((id, i) => positions.set(id, i)));
  };

  reindex();

  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const order = downward ? [...layers.keys()] : [...layers.keys()].reverse();

    for (const index of order) {
      const layer = layers[index];
      const neighbours = (id: string) => (downward ? graph.in.get(id)! : graph.out.get(id)!);

      const scored = layer.map((id) => ({ id, score: barycenter(id, neighbours(id), positions) }));
      scored.sort((a, b) => a.score - b.score);
      layers[index] = scored.map((s) => s.id);

      reindex();
    }
  }
}

/**
 * Turn ranks and orderings into coordinates.
 *
 * The rank axis is packed by the widest (or tallest) node in each rank. Within a
 * rank, nodes are stacked in order, then nudged toward the average position of
 * their neighbours — a cheap stand-in for the priority method that removes most
 * of the zig-zag without the bookkeeping.
 */
function assignCoordinates(
  layers: string[][],
  graph: Graph,
  sizes: Map<string, { w: number; h: number }>,
  options: LayoutOptions
): Map<string, Point> {
  const horizontal = options.direction === 'LR';
  const positions = new Map<string, Point>();

  // Along the rank axis.
  const rankOffsets: number[] = [];
  let cursor = 0;
  for (const layer of layers) {
    rankOffsets.push(cursor);
    const extent = Math.max(
      0,
      ...layer.map((id) => (horizontal ? sizes.get(id)!.w : sizes.get(id)!.h))
    );
    cursor += extent + options.rankSep;
  }

  // Within each rank.
  const cross = new Map<string, number>();
  layers.forEach((layer) => {
    let offset = 0;
    for (const id of layer) {
      cross.set(id, offset);
      offset += (horizontal ? sizes.get(id)!.h : sizes.get(id)!.w) + options.nodeSep;
    }
  });

  // Straighten: pull each node toward its neighbours, then re-pack so the nudge
  // cannot make two nodes overlap.
  for (let pass = 0; pass < 3; pass++) {
    for (const layer of layers) {
      for (const id of layer) {
        const linked = [...graph.in.get(id)!, ...graph.out.get(id)!];
        if (linked.length === 0) continue;

        const target = barycenter(id, linked, cross);
        cross.set(id, (cross.get(id)! + target) / 2);
      }

      layer.sort((a, b) => cross.get(a)! - cross.get(b)!);

      let offset = -Infinity;
      for (const id of layer) {
        const size = horizontal ? sizes.get(id)!.h : sizes.get(id)!.w;
        const placed = Math.max(cross.get(id)!, offset);
        cross.set(id, placed);
        offset = placed + size + options.nodeSep;
      }
    }
  }

  layers.forEach((layer, rankIndex) => {
    for (const id of layer) {
      const along = rankOffsets[rankIndex];
      const across = cross.get(id)!;
      positions.set(id, horizontal ? { x: along, y: across } : { x: across, y: along });
    }
  });

  return positions;
}

/** Snap to the canvas grid so laid-out nodes line up with hand-placed ones. */
function snap(value: number): number {
  return Math.round(value / METRICS.gridSnap) * METRICS.gridSnap;
}

/**
 * Lay out the tables in a diagram.
 *
 * Returns new positions for the nodes it moved; anything absent from the result
 * keeps its current position. Notes are parked beside the first table they
 * annotate, and groups are left alone — they are regions, and resizing them
 * under the user is more surprising than helpful.
 */
export function layeredLayout(
  nodes: readonly DBNode[],
  edges: readonly DBEdge[],
  options: Partial<LayoutOptions> = {}
): Map<string, Point> {
  const opts = { ...DEFAULT_LAYOUT, ...options };

  const tables = nodes.filter(
    (n) => n.type === 'table' && (!opts.only || opts.only.has(n.id))
  );
  if (tables.length === 0) return new Map();

  const sizes = new Map(nodes.map((n) => [n.id, { w: n.w, h: n.h }]));

  const graph = buildGraph(tables.map((n) => n.id), edges);
  breakCycles(graph);

  const layers = groupByRank(graph, assignRanks(graph));
  orderLayers(layers, graph);

  const raw = assignCoordinates(layers, graph, sizes, opts);

  // Anchor the result at the top-left of where the laid-out nodes already were,
  // so the diagram does not jump across the canvas when the button is pressed.
  const anchor = tables.reduce(
    (acc, n) => ({ x: Math.min(acc.x, n.x), y: Math.min(acc.y, n.y) }),
    { x: Infinity, y: Infinity }
  );

  const positions = new Map<string, Point>();
  for (const [id, p] of raw) {
    positions.set(id, { x: snap(anchor.x + p.x), y: snap(anchor.y + p.y) });
  }

  placeNotes(nodes, edges, positions, sizes);
  return positions;
}

/** Park each note just right of the first table it links to. */
function placeNotes(
  nodes: readonly DBNode[],
  edges: readonly DBEdge[],
  positions: Map<string, Point>,
  sizes: Map<string, { w: number; h: number }>
): void {
  for (const node of nodes) {
    if (node.type !== 'note') continue;

    const link = edges.find(
      (e) =>
        (e.source.nodeId === node.id && positions.has(e.target.nodeId)) ||
        (e.target.nodeId === node.id && positions.has(e.source.nodeId))
    );
    if (!link) continue;

    const anchorId = link.source.nodeId === node.id ? link.target.nodeId : link.source.nodeId;
    const anchor = positions.get(anchorId)!;

    positions.set(node.id, {
      x: snap(anchor.x + sizes.get(anchorId)!.w + 60),
      y: snap(anchor.y),
    });
  }
}

/**
 * Arrange nodes on a simple grid.
 *
 * For diagrams with no relationships at all, where layered layout has nothing to
 * work with and would produce a single long row.
 */
export function gridLayout(
  nodes: readonly DBNode[],
  options: { columns?: number; gap?: number; only?: ReadonlySet<string> } = {}
): Map<string, Point> {
  const subject = nodes.filter((n) => n.type !== 'group' && (!options.only || options.only.has(n.id)));
  if (subject.length === 0) return new Map();

  const gap = options.gap ?? 60;
  const columns = options.columns ?? Math.ceil(Math.sqrt(subject.length));

  const anchor = subject.reduce(
    (acc, n) => ({ x: Math.min(acc.x, n.x), y: Math.min(acc.y, n.y) }),
    { x: Infinity, y: Infinity }
  );

  const colWidth = Math.max(...subject.map((n) => n.w)) + gap;
  const rowHeight = Math.max(...subject.map((n) => n.h)) + gap;

  const positions = new Map<string, Point>();
  subject.forEach((node, i) => {
    positions.set(node.id, {
      x: snap(anchor.x + (i % columns) * colWidth),
      y: snap(anchor.y + Math.floor(i / columns) * rowHeight),
    });
  });

  return positions;
}

/** Bounding box of a set of positions, for framing the result. */
export function layoutBounds(
  positions: ReadonlyMap<string, Point>,
  nodes: readonly DBNode[]
): { x: number; y: number; w: number; h: number } {
  const rects = nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({ ...nodeRect(n), ...positions.get(n.id)! }));

  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The cheap orthogonal route: a stub out of each port, then a Z or L to join them.
 *
 * No obstacle awareness and no search — a few arithmetic operations per edge. It
 * has two jobs:
 *
 * 1. It is what the canvas ships with before the A* router lands.
 * 2. It stays afterwards as the fallback: used for edges attached to a node while
 *    it is being dragged, and whenever the real router blows its expansion budget.
 *    Rerouting 500 edges properly on every pointer-move would not hold a frame.
 */
import type { Point } from '../geometry';
import { sideNormal, type ResolvedEdge } from './endpoints';

/** How far a path travels straight out of a port before it may turn. */
export const STUB = 18;

function isHorizontal(side: 'left' | 'right' | 'top' | 'bottom'): boolean {
  return side === 'left' || side === 'right';
}

/** Drop midpoints that lie on a straight run between their neighbours. */
export function simplify(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const out: Point[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const current = points[i];
    const next = points[i + 1];

    const collinear =
      (prev.x === current.x && current.x === next.x) ||
      (prev.y === current.y && current.y === next.y);

    if (!collinear) out.push(current);
  }

  out.push(points[points.length - 1]);
  return out;
}

/**
 * Build a right-angled path between two resolved endpoints.
 *
 * Both ends leave perpendicular to their side, then meet either at a shared
 * midpoint (when the sides oppose) or via a single corner (when they don't).
 */
export function cheapRoute(edge: ResolvedEdge): Point[] {
  const { source, target } = edge;
  const sn = sideNormal(source.side);
  const tn = sideNormal(target.side);

  const a = source.point;
  const b = target.point;

  const a1 = { x: a.x + sn.x * STUB, y: a.y + sn.y * STUB };
  const b1 = { x: b.x + tn.x * STUB, y: b.y + tn.y * STUB };

  const sourceH = isHorizontal(source.side);
  const targetH = isHorizontal(target.side);

  let middle: Point[];

  if (sourceH && targetH) {
    // Both sideways: meet on a shared vertical corridor halfway between the stubs.
    const midX = (a1.x + b1.x) / 2;
    middle = [
      { x: midX, y: a1.y },
      { x: midX, y: b1.y },
    ];
  } else if (!sourceH && !targetH) {
    // Both vertical: shared horizontal corridor.
    const midY = (a1.y + b1.y) / 2;
    middle = [
      { x: a1.x, y: midY },
      { x: b1.x, y: midY },
    ];
  } else if (sourceH) {
    // Sideways out, vertically in: one corner.
    middle = [{ x: b1.x, y: a1.y }];
  } else {
    middle = [{ x: a1.x, y: b1.y }];
  }

  return simplify([a, a1, ...middle, b1, b]);
}

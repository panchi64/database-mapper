/**
 * Spreading overlapping runs into lanes.
 *
 * The single biggest readability win available, and it is a post-pass rather than
 * part of the search. Two relationships between the same pair of tables — say a
 * shipping address and a billing address both pointing at `addresses` — produce
 * near-identical optimal paths and land exactly on top of each other. No amount
 * of clever searching separates them, because both answers really are optimal.
 *
 * So: find segments sharing a corridor, and fan them out.
 */
import type { Point } from '../geometry';

/** Distance between adjacent lanes in a corridor. */
export const LANE_GAP = 7;

/** Corridors are bucketed at this resolution before being spread. */
const BUCKET = 8;

export interface RoutedEdge {
  id: string;
  path: Point[];
}

interface Segment {
  edgeId: string;
  /** Index of the segment's first point within its path. */
  index: number;
  horizontal: boolean;
  /** The shared coordinate: y for a horizontal run, x for a vertical one. */
  coord: number;
  from: number;
  to: number;
}

function bucketKey(horizontal: boolean, coord: number): string {
  return `${horizontal ? 'h' : 'v'}:${Math.round(coord / BUCKET)}`;
}

function overlaps(a: Segment, b: Segment): boolean {
  const aLo = Math.min(a.from, a.to);
  const aHi = Math.max(a.from, a.to);
  const bLo = Math.min(b.from, b.to);
  const bHi = Math.max(b.from, b.to);
  return aHi > bLo && bHi > aLo;
}

/**
 * Offset overlapping colinear segments so they run side by side.
 *
 * Only interior segments are moved. The first and last segment of a path
 * terminate at a port, and a port is a fixed point — shifting it would detach the
 * line from the column it belongs to, which is worse than an overlap.
 *
 * Mutates nothing; returns fresh paths.
 */
export function assignLanes(routes: readonly RoutedEdge[]): Map<string, Point[]> {
  const paths = new Map<string, Point[]>();
  for (const route of routes) paths.set(route.id, route.path.map((p) => ({ ...p })));

  // Collect interior segments, bucketed by the corridor they occupy.
  const corridors = new Map<string, Segment[]>();

  for (const route of routes) {
    const path = route.path;
    // A segment is interior when neither of its endpoints is a path endpoint.
    for (let i = 1; i < path.length - 2; i++) {
      const a = path[i];
      const b = path[i + 1];

      const horizontal = a.y === b.y;
      if (!horizontal && a.x !== b.x) continue; // diagonal: not ours to move

      const segment: Segment = {
        edgeId: route.id,
        index: i,
        horizontal,
        coord: horizontal ? a.y : a.x,
        from: horizontal ? a.x : a.y,
        to: horizontal ? b.x : b.y,
      };

      const key = bucketKey(horizontal, segment.coord);
      const bucket = corridors.get(key);
      if (bucket) bucket.push(segment);
      else corridors.set(key, [segment]);
    }
  }

  for (const segments of corridors.values()) {
    if (segments.length < 2) continue;

    // Within a corridor, only segments that actually overlap need separating;
    // two runs at the same y but different x ranges are not on top of each other.
    for (const group of overlappingGroups(segments)) {
      if (group.length < 2) continue;

      // Order by where each segment sits along the perpendicular axis at its
      // start, so lines keep their relative order and do not cross needlessly.
      group.sort((a, b) => a.from - b.from || a.edgeId.localeCompare(b.edgeId));

      const centre = (group.length - 1) / 2;

      group.forEach((segment, i) => {
        const offset = (i - centre) * LANE_GAP;
        if (offset === 0) return;

        const path = paths.get(segment.edgeId);
        if (!path) return;

        const a = path[segment.index];
        const b = path[segment.index + 1];

        if (segment.horizontal) {
          a.y += offset;
          b.y += offset;
        } else {
          a.x += offset;
          b.x += offset;
        }
      });
    }
  }

  return paths;
}

/** Partition a corridor's segments into sets that mutually overlap. */
function overlappingGroups(segments: Segment[]): Segment[][] {
  const remaining = [...segments];
  const groups: Segment[][] = [];

  while (remaining.length > 0) {
    const group = [remaining.shift()!];

    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (group.some((member) => overlaps(member, remaining[i]))) {
          group.push(remaining.splice(i, 1)[0]);
          grew = true;
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

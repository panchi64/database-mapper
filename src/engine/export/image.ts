/**
 * Exporting the whole diagram as a picture.
 *
 * Builds a scene framed on the entire diagram — not the current viewport — and
 * replays it through the same painter the canvas uses, either onto an offscreen
 * canvas (PNG) or through the SVG serialiser.
 */
import { diagramBounds, type Rect, type TextMeasurer } from '../geometry';
import { paintAll } from '../painter';
import { routeEdges } from '../routing';
import { buildScene } from '../scene';
import type { Palette } from '../theme';
import type { DBEdge, DBNode } from '@/types';
import { sceneToSvg } from './svg';

export interface ExportInput {
  nodes: readonly DBNode[];
  edges: readonly DBEdge[];
  palette: Palette;
  measurer: TextMeasurer;
  padding?: number;
  /** Pixel density for the raster export. */
  scale?: number;
  transparent?: boolean;
}

/**
 * The scene for a whole-diagram export.
 *
 * Framed at zoom 1 on the diagram's own bounds, with the grid and every
 * interaction affordance off — a picture of a diagram should not include the
 * grid dots or a selection ring.
 */
function fullScene(input: ExportInput): { scene: ReturnType<typeof buildScene>; bounds: Rect } {
  const bounds = diagramBounds([...input.nodes]);
  const padding = input.padding ?? 32;

  const nodesById = new Map(input.nodes.map((n) => [n.id, n]));

  const scene = buildScene({
    nodes: input.nodes,
    edges: input.edges,
    routes: routeEdges(input.edges, nodesById),
    // A viewport that contains everything, so nothing is culled.
    viewport: { x: -(bounds.x - padding), y: -(bounds.y - padding), zoom: 1 },
    size: { width: bounds.w + padding * 2, height: bounds.h + padding * 2 },
    palette: input.palette,
    measurer: input.measurer,
    selectedNodeIds: new Set(),
    selectedEdgeId: null,
    showGrid: false,
  });

  return { scene, bounds };
}

export function exportSvg(input: ExportInput): string {
  const { scene, bounds } = fullScene(input);

  return sceneToSvg(scene, bounds, {
    padding: input.padding ?? 32,
    ...(input.transparent ? {} : { background: input.palette.background }),
  });
}

/**
 * Largest canvas we are willing to ask a browser for.
 *
 * Every engine caps both the longest side and the total area, and over the cap
 * the canvas silently comes back blank or `toBlob` yields null. The limits vary
 * (Firefox is ~124 Mpx, Safari far lower), so these sit under the strictest ones
 * we can reasonably support rather than at any one browser's ceiling.
 */
const MAX_EXPORT_SIDE_PX = 8192;
const MAX_EXPORT_AREA_PX = 32_000_000;

/**
 * The pixel density an export can actually use.
 *
 * The 300-table fixture is ~8100x7200 world units, which at the default 2x is a
 * 233-megapixel canvas — over every browser's limit. Scaling down produces a
 * smaller picture; not scaling down produces no picture at all.
 */
export function exportScale(width: number, height: number, requested: number): number {
  const fit = Math.min(
    MAX_EXPORT_SIDE_PX / width,
    MAX_EXPORT_SIDE_PX / height,
    Math.sqrt(MAX_EXPORT_AREA_PX / (width * height))
  );

  // A hair under the exact fit: the caller rounds each side *up* to whole
  // pixels, and `sqrt` can land a few ulps over the area cap on its own.
  return Math.min(requested, fit * 0.999);
}

export async function exportPng(input: ExportInput): Promise<Blob> {
  const { scene, bounds } = fullScene(input);

  const padding = input.padding ?? 32;
  const width = Math.max(1, bounds.w + padding * 2);
  const height = Math.max(1, bounds.h + padding * 2);
  const scale = exportScale(width, height, input.scale ?? 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas to export to.');

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (!input.transparent) {
    ctx.fillStyle = input.palette.background;
    ctx.fillRect(0, 0, width, height);
  }

  // Shift the world so the diagram's top-left sits inside the padding.
  ctx.translate(-(bounds.x - padding), -(bounds.y - padding));

  for (const group of scene.groups) {
    ctx.save();
    ctx.translate(group.rect.x, group.rect.y);
    paintAll(ctx, group.prims);
    ctx.restore();
  }

  for (const edge of scene.edges) paintAll(ctx, edge.prims);

  for (const node of scene.nodes) {
    ctx.save();
    ctx.translate(node.rect.x, node.rect.y);
    paintAll(ctx, node.prims);
    ctx.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png'
    );
  });
}

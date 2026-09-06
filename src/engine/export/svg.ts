/**
 * Serialising a scene to SVG.
 *
 * This is the payoff for making `buildScene` return data rather than issue draw
 * calls: the exporter is a second backend for the same `Primitive` list, so
 * exported vector output cannot drift from what the canvas shows.
 */
import type { Point } from '../geometry';
import type { Primitive, Scene } from '../primitives';

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `600 14px system-ui, ...` -> the attributes SVG wants. */
function fontAttributes(font: string): string {
  const match = /^(?:(\d+)\s+)?(\d+(?:\.\d+)?)px\s+(.+)$/.exec(font.trim());
  if (!match) return `font-family="sans-serif" font-size="12"`;

  const [, weight, size, family] = match;
  const weightAttr = weight ? ` font-weight="${weight}"` : '';
  return `font-family="${escapeText(family)}" font-size="${size}"${weightAttr}`;
}

const ANCHOR: Record<string, string> = { left: 'start', center: 'middle', right: 'end', start: 'start', end: 'end' };
const BASELINE: Record<string, string> = {
  middle: 'central',
  top: 'hanging',
  bottom: 'auto',
  alphabetic: 'auto',
};

function paint(value: string | undefined): string {
  return value ?? 'none';
}

/** Rounded-rect path, matching `painter.ts` so both backends agree. */
function roundRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
): string {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  const max = Math.min(w, h) / 2;
  const c = (v: number) => Math.max(0, Math.min(v, max));

  return [
    `M ${x + c(tl)} ${y}`,
    `L ${x + w - c(tr)} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + c(tr)}`,
    `L ${x + w} ${y + h - c(br)}`,
    `Q ${x + w} ${y + h} ${x + w - c(br)} ${y + h}`,
    `L ${x + c(bl)} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - c(bl)}`,
    `L ${x} ${y + c(tl)}`,
    `Q ${x} ${y} ${x + c(tl)} ${y}`,
    'Z',
  ].join(' ');
}

function polylinePath(pts: Point[], radius: number, closed: boolean): string {
  if (pts.length === 0) return '';
  if (pts.length === 1 || radius <= 0) {
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return closed ? `${line} Z` : line;
  }

  const parts = [`M ${pts[0].x} ${pts[0].y}`];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);

    if (r <= 0.01) {
      parts.push(`L ${cur.x} ${cur.y}`);
      continue;
    }

    const inUnit = { x: (cur.x - prev.x) / inLen, y: (cur.y - prev.y) / inLen };
    const outUnit = { x: (next.x - cur.x) / outLen, y: (next.y - cur.y) / outLen };

    parts.push(`L ${cur.x - inUnit.x * r} ${cur.y - inUnit.y * r}`);
    parts.push(
      `Q ${cur.x} ${cur.y} ${cur.x + outUnit.x * r} ${cur.y + outUnit.y * r}`
    );
  }

  const last = pts[pts.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  if (closed) parts.push('Z');

  return parts.join(' ');
}

export function primitiveToSvg(p: Primitive): string {
  switch (p.t) {
    case 'rect': {
      const stroke = p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.lw ?? 1}"` : '';
      if (p.r) {
        return `<path d="${roundRectPath(p.x, p.y, p.w, p.h, p.r)}" fill="${paint(p.fill)}"${stroke}/>`;
      }
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${paint(p.fill)}"${stroke}/>`;
    }

    case 'text':
      return (
        `<text x="${p.x}" y="${p.y}" fill="${p.fill}" ${fontAttributes(p.font)}` +
        ` text-anchor="${ANCHOR[p.align ?? 'left'] ?? 'start'}"` +
        ` dominant-baseline="${BASELINE[p.baseline ?? 'alphabetic'] ?? 'auto'}">` +
        `${escapeText(p.s)}</text>`
      );

    case 'line': {
      const dash = p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : '';
      return (
        `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"` +
        ` stroke="${p.stroke}" stroke-width="${p.lw ?? 1}"${dash} stroke-linecap="round"/>`
      );
    }

    case 'path': {
      const dash = p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : '';
      const stroke = p.stroke
        ? ` stroke="${p.stroke}" stroke-width="${p.lw ?? 1}" stroke-linejoin="round" stroke-linecap="round"${dash}`
        : '';
      return `<path d="${polylinePath(p.pts, p.radius ?? 0, p.closed ?? false)}" fill="${paint(p.fill)}"${stroke}/>`;
    }

    case 'circle': {
      const stroke = p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.lw ?? 1}"` : '';
      return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${paint(p.fill)}"${stroke}/>`;
    }
  }
}

export interface SvgExportOptions {
  background?: string;
  padding?: number;
}

/**
 * Render a scene to a standalone SVG document.
 *
 * Node primitives are in local coordinates, so each node is wrapped in a
 * translating group — exactly what the renderer does before blitting a bitmap.
 */
export function sceneToSvg(
  scene: Scene,
  bounds: { x: number; y: number; w: number; h: number },
  options: SvgExportOptions = {}
): string {
  const padding = options.padding ?? 32;
  const x = bounds.x - padding;
  const y = bounds.y - padding;
  const w = Math.max(1, bounds.w + padding * 2);
  const h = Math.max(1, bounds.h + padding * 2);

  const parts: string[] = [];

  if (options.background) {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${options.background}"/>`);
  }

  const group = (node: { rect: { x: number; y: number }; prims: Primitive[] }) =>
    `<g transform="translate(${node.rect.x} ${node.rect.y})">` +
    node.prims.map(primitiveToSvg).join('') +
    '</g>';

  for (const g of scene.groups) parts.push(group(g));
  for (const edge of scene.edges) parts.push(...edge.prims.map(primitiveToSvg));
  for (const node of scene.nodes) parts.push(group(node));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" ` +
    `width="${Math.round(w)}" height="${Math.round(h)}">` +
    parts.join('') +
    '</svg>'
  );
}

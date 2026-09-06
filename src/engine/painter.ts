/**
 * Turning primitives into canvas calls.
 *
 * The only module that touches `CanvasRenderingContext2D` drawing operations.
 * Everything it needs arrives as a `Primitive`, which is why the same scene can be
 * replayed into an offscreen bitmap, a minimap, or a PNG export at 4x.
 */
import type { Point } from './geometry';
import type { Primitive } from './primitives';

/** The subset of the 2D context we actually use — lets tests pass a recorder. */
export type Ctx2D = CanvasRenderingContext2D;

function roundRectPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
): void {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  const max = Math.min(w, h) / 2;
  const c = (v: number) => Math.max(0, Math.min(v, max));

  ctx.beginPath();
  ctx.moveTo(x + c(tl), y);
  ctx.lineTo(x + w - c(tr), y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + c(tr));
  ctx.lineTo(x + w, y + h - c(br));
  ctx.quadraticCurveTo(x + w, y + h, x + w - c(br), y + h);
  ctx.lineTo(x + c(bl), y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - c(bl));
  ctx.lineTo(x, y + c(tl));
  ctx.quadraticCurveTo(x, y, x + c(tl), y);
  ctx.closePath();
}

/**
 * Trace a polyline, optionally rounding each corner.
 *
 * The rounding pulls back along both incident segments by `radius` (clamped to
 * half the shorter one, so short segments degrade to a sharp corner rather than
 * overshooting) and joins them with a quadratic through the original vertex.
 */
function polylinePath(ctx: Ctx2D, pts: Point[], radius = 0, closed = false): void {
  ctx.beginPath();

  if (pts.length === 0) return;
  if (pts.length === 1 || radius <= 0) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);

    if (r <= 0.01) {
      ctx.lineTo(cur.x, cur.y);
      continue;
    }

    const inUnit = { x: (cur.x - prev.x) / inLen, y: (cur.y - prev.y) / inLen };
    const outUnit = { x: (next.x - cur.x) / outLen, y: (next.y - cur.y) / outLen };

    ctx.lineTo(cur.x - inUnit.x * r, cur.y - inUnit.y * r);
    ctx.quadraticCurveTo(cur.x, cur.y, cur.x + outUnit.x * r, cur.y + outUnit.y * r);
  }

  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  if (closed) ctx.closePath();
}

export function paintPrimitive(ctx: Ctx2D, p: Primitive): void {
  switch (p.t) {
    case 'rect': {
      if (p.r) roundRectPath(ctx, p.x, p.y, p.w, p.h, p.r);
      else {
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.w, p.h);
      }
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill();
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.lw ?? 1;
        ctx.stroke();
      }
      break;
    }

    case 'text': {
      ctx.font = p.font;
      ctx.fillStyle = p.fill;
      ctx.textAlign = p.align ?? 'left';
      ctx.textBaseline = p.baseline ?? 'alphabetic';
      ctx.fillText(p.s, p.x, p.y);
      break;
    }

    case 'line': {
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.lw ?? 1;
      if (p.dash) ctx.setLineDash(p.dash);
      ctx.stroke();
      if (p.dash) ctx.setLineDash([]);
      break;
    }

    case 'path': {
      polylinePath(ctx, p.pts, p.radius ?? 0, p.closed);
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill();
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.lw ?? 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (p.dash) ctx.setLineDash(p.dash);
        ctx.stroke();
        if (p.dash) ctx.setLineDash([]);
      }
      break;
    }

    case 'circle': {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill();
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.lw ?? 1;
        ctx.stroke();
      }
      break;
    }
  }
}

export function paintAll(ctx: Ctx2D, prims: readonly Primitive[]): void {
  for (const p of prims) paintPrimitive(ctx, p);
}

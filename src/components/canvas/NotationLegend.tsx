/**
 * Crow's-foot notation legend.
 *
 * Crow's feet are conventional but not self-explanatory — a bar and a three-pronged
 * fork mean nothing until someone tells you they mean "one" and "many".
 *
 * The glyphs are painted by the **same** `drawEdge` the canvas uses, on a
 * two-point route, rather than hand-drawn SVG. A legend that is redrawn by
 * different code from the thing it documents drifts out of date silently; this one
 * cannot.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawEdge } from '@/engine/draw/edge';
import { paintAll } from '@/engine/painter';
import type { Palette } from '@/engine/theme';
import type { Cardinality, DBEdge } from '@/types';

const GLYPH_W = 62;
const GLYPH_H = 20;

interface Row {
  label: string;
  hint: string;
  cardinality?: Cardinality;
  noteLink?: boolean;
}

const ROWS: Row[] = [
  { label: 'One to one', hint: 'exactly one on each side', cardinality: 'one-to-one' },
  { label: 'One to many', hint: 'one row relates to many', cardinality: 'one-to-many' },
  { label: 'Many to many', hint: 'many on both sides', cardinality: 'many-to-many' },
  { label: 'Note link', hint: 'annotation, not a relationship', noteLink: true },
];

function glyphEdge(row: Row): DBEdge {
  return {
    id: `legend-${row.label}`,
    source: { nodeId: 'a' },
    target: { nodeId: 'b' },
    data: {
      type: 'relationship',
      cardinality: row.cardinality,
      isNoteLink: row.noteLink === true,
      ...(row.noteLink ? { pattern: 'dashed' as const } : {}),
    },
  };
}

function LegendGlyph({ row, palette }: { row: Row; palette: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = GLYPH_W * dpr;
    canvas.height = GLYPH_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GLYPH_W, GLYPH_H);

    // Inset so the markers, which sit outside the endpoints, stay in frame.
    const y = GLYPH_H / 2;
    const route = [
      { x: 12, y },
      { x: GLYPH_W - 12, y },
    ];

    paintAll(ctx, drawEdge(glyphEdge(row), route, { palette, selected: false }).prims);
  }, [row, palette]);

  return (
    <canvas
      ref={ref}
      width={GLYPH_W}
      height={GLYPH_H}
      style={{ width: GLYPH_W, height: GLYPH_H }}
      className="flex-shrink-0"
      aria-hidden
    />
  );
}

export function NotationLegend({ palette }: { palette: Palette }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute right-4 top-4 z-10 overflow-hidden rounded-md border border-border bg-card shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        Notation
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>

      {open && (
        <ul className="border-t border-border px-3 py-2">
          {ROWS.map((row) => (
            <li key={row.label} className="flex items-center gap-3 py-1" title={row.hint}>
              <LegendGlyph row={row} palette={palette} />
              <div className="min-w-0">
                <div className="text-xs leading-tight text-foreground">{row.label}</div>
                <div className="text-[10px] leading-tight text-muted-foreground">{row.hint}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

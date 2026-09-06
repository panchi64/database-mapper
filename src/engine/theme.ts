/**
 * CSS custom properties -> concrete colours the canvas can paint with.
 *
 * The DOM layer styles itself with `hsl(var(--border))` and friends, resolved by
 * the browser per element. A canvas has no cascade: `ctx.strokeStyle` needs a real
 * colour string. So we read the variables off the document root once per theme
 * change and hand the renderer a plain palette.
 *
 * Keeping this in one place means the canvas and the surrounding React chrome stay
 * the same colour without either duplicating the other's values.
 */
import { PRESET_COLORS } from '@/types';

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  accent: string;
  destructive: string;

  /** Diagram-specific colours, derived from the tokens above. */
  grid: string;
  nodeBg: string;
  nodeBorder: string;
  rowText: string;
  typeText: string;
  rowDivider: string;
  rowHover: string;
  edge: string;
  edgeSelected: string;
  edgeDimmed: string;
  selectionRing: string;
  marqueeFill: string;
  marqueeStroke: string;
  highlight: string;
  highlightRing: string;
  portSource: string;
  portTarget: string;
  portHalo: string;

  /** The eight node colours, by name. */
  presets: Record<string, string>;
  /** True when the resolved theme is dark; a few strokes flip weight. */
  isDark: boolean;
}

const PRESET_MAP: Record<string, string> = Object.fromEntries(
  PRESET_COLORS.map((c) => [c.name, c.value])
);

/**
 * Palette used when there is no document to read from — tests, and the first
 * frame before styles resolve. Mirrors the light values in `src/index.css`.
 */
export const FALLBACK_PALETTE: Palette = buildPalette(
  {
    background: '0 0% 100%',
    foreground: '215 25% 27%',
    card: '0 0% 100%',
    'card-foreground': '215 25% 27%',
    muted: '210 40% 96.1%',
    'muted-foreground': '215 16% 47%',
    border: '214.3 31.8% 91.4%',
    primary: '222.2 47.4% 11.2%',
    accent: '210 40% 96.1%',
    destructive: '0 84.2% 60.2%',
  },
  false
);

function hsl(triplet: string): string {
  // The tokens are stored as bare `H S% L%` so they can be composed with an alpha.
  return `hsl(${triplet.trim()})`;
}

function hsla(triplet: string, alpha: number): string {
  return `hsl(${triplet.trim()} / ${alpha})`;
}

function buildPalette(vars: Record<string, string>, isDark: boolean): Palette {
  const v = (name: string, fallback = '0 0% 50%') => vars[name]?.trim() || fallback;

  return {
    background: hsl(v('background')),
    foreground: hsl(v('foreground')),
    card: hsl(v('card')),
    cardForeground: hsl(v('card-foreground')),
    muted: hsl(v('muted')),
    mutedForeground: hsl(v('muted-foreground')),
    border: hsl(v('border')),
    primary: hsl(v('primary')),
    accent: hsl(v('accent')),
    destructive: hsl(v('destructive')),

    grid: hsla(v('muted-foreground'), isDark ? 0.16 : 0.22),
    nodeBg: hsl(v('card')),
    nodeBorder: hsl(v('border')),
    rowText: hsl(v('foreground')),
    typeText: hsl(v('muted-foreground')),
    rowDivider: hsla(v('border'), isDark ? 0.8 : 1),
    rowHover: hsla(v('muted-foreground'), 0.08),

    edge: hsla(v('muted-foreground'), isDark ? 0.85 : 0.7),
    edgeSelected: hsl(v('primary')),
    edgeDimmed: hsla(v('muted-foreground'), 0.15),

    selectionRing: '#3b82f6',
    marqueeFill: 'rgba(59, 130, 246, 0.10)',
    marqueeStroke: 'rgba(59, 130, 246, 0.75)',

    highlight: isDark ? 'rgba(250, 204, 21, 0.22)' : 'rgba(254, 240, 138, 0.75)',
    highlightRing: '#facc15',

    portSource: isDark ? '#60a5fa' : '#3b82f6',
    portTarget: isDark ? '#fbbf24' : '#f59e0b',
    portHalo: hsl(v('card')),

    presets: PRESET_MAP,
    isDark,
  };
}

const TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'muted',
  'muted-foreground',
  'border',
  'primary',
  'accent',
  'destructive',
] as const;

/**
 * Read the live palette off the document.
 *
 * Call this on mount and whenever the theme changes; the result is stable enough
 * to cache and pass down to the renderer as a single value.
 */
export function readPalette(root: HTMLElement = document.documentElement): Palette {
  const computed = getComputedStyle(root);

  const vars: Record<string, string> = {};
  for (const token of TOKENS) {
    vars[token] = computed.getPropertyValue(`--${token}`);
  }

  // Every token empty means styles have not resolved yet (or there is no CSS at
  // all, as in a unit test) — the fallback keeps the first frame from painting
  // everything mid-grey.
  if (TOKENS.every((t) => !vars[t].trim())) return FALLBACK_PALETTE;

  return buildPalette(vars, root.classList.contains('dark'));
}

/** Resolve a node's colour name to a hex value, with the usual default. */
export function presetColor(palette: Palette, name: string | undefined, fallback = 'slate'): string {
  return palette.presets[name ?? fallback] ?? palette.presets[fallback];
}

/**
 * Blend a preset colour into a header fill.
 *
 * The DOM version used Tailwind's `bg-{color}-100 dark:bg-{color}-900` pairs,
 * which we can't reference from a canvas. Compositing the preset over the card
 * colour at low alpha gives the same effect from one value per colour.
 */
export function headerFill(palette: Palette, name: string | undefined): string {
  const hex = presetColor(palette, name);
  return withAlpha(hex, palette.isDark ? 0.28 : 0.16);
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Cached canvas text measurement.
 *
 * `ctx.measureText` is not free, and layout calls it for every column of every
 * table on every reflow. The strings barely change between frames, so an LRU over
 * `font|text` turns almost all of those into map lookups.
 */
import type { TextMeasurer } from './geometry';

const DEFAULT_CAPACITY = 5000;

/**
 * A `TextMeasurer` backed by a real canvas context, with an LRU in front.
 *
 * Map iteration order is insertion order, so the oldest key is simply the first
 * one — re-inserting on hit is all the bookkeeping an LRU needs here.
 */
export class CanvasTextMeasurer implements TextMeasurer {
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly capacity = DEFAULT_CAPACITY
  ) {}

  measure(text: string, font: string): number {
    const key = `${font}|${text}`;

    const hit = this.cache.get(key);
    if (hit !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }

    this.ctx.font = font;
    const width = this.ctx.measureText(text).width;

    this.cache.set(key, width);
    if (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    return width;
  }

  /**
   * Drop everything. Needed after fonts finish loading, because measurements
   * taken against the fallback face are wrong for the real one.
   */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Shorten `text` with an ellipsis so it fits `maxWidth`.
 *
 * Binary search rather than a character-at-a-time walk: a 40-character name that
 * needs trimming costs ~6 measurements instead of ~40, and those measurements are
 * the expensive part.
 */
export function truncate(
  text: string,
  maxWidth: number,
  font: string,
  measurer: TextMeasurer
): string {
  if (maxWidth <= 0) return '';
  if (measurer.measure(text, font) <= maxWidth) return text;

  const ellipsis = '…';
  const ellipsisWidth = measurer.measure(ellipsis, font);
  if (ellipsisWidth > maxWidth) return '';

  const budget = maxWidth - ellipsisWidth;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measurer.measure(text.slice(0, mid), font) <= budget) low = mid;
    else high = mid - 1;
  }

  return low === 0 ? ellipsis : text.slice(0, low) + ellipsis;
}

/**
 * Greedy word wrap. Used for note bodies, which are the only free text we draw.
 * Words longer than a line are hard-broken rather than allowed to overflow.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: string,
  measurer: TextMeasurer,
  maxLines = Infinity
): string[] {
  if (maxWidth <= 0 || !text) return [];

  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (lines.length >= maxLines) break;

    if (paragraph === '') {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;

      const candidate = current ? `${current} ${word}` : word;
      if (measurer.measure(candidate, font) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      if (lines.length >= maxLines) break;

      // A single word too wide for the line has to be split.
      if (measurer.measure(word, font) > maxWidth) {
        let chunk = '';
        for (const char of word) {
          if (measurer.measure(chunk + char, font) > maxWidth && chunk) {
            lines.push(chunk);
            if (lines.length >= maxLines) break;
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }

    if (current && lines.length < maxLines) lines.push(current);
  }

  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

/**
 * Resolve when webfonts are ready, so the first paint isn't measured against a
 * fallback face. Resolves immediately where the API is missing.
 */
export function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return document.fonts.ready.then(() => undefined);
}

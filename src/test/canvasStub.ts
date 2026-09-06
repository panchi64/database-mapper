/**
 * A stand-in for `CanvasRenderingContext2D`.
 *
 * jsdom has no canvas, and the `canvas` npm package is a native build we do not
 * want in the dependency tree just to run tests. This records the calls made
 * against it instead, which serves two purposes:
 *
 * - `installCanvasStub()` lets component tests mount the canvas surface.
 * - `createRecordingContext()` lets renderer tests assert on *what was drawn*
 *   without comparing pixels — the reason `scene.ts` emits data rather than
 *   issuing draw calls directly.
 */

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
  /** Every call to one method, in order. */
  callsTo: (method: string) => RecordedCall[];
  /** Text drawn, in order. */
  texts: () => string[];
  reset: () => void;
}

const NOOP_METHODS = [
  'arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath',
  'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo',
  'putImageData', 'quadraticCurveTo', 'rect', 'resetTransform', 'restore', 'rotate',
  'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect',
  'strokeText', 'transform', 'translate',
] as const;

/**
 * Deterministic text metrics: 6px per character.
 *
 * Fixed rather than realistic on purpose — layout tests should assert on the
 * relationships between measurements, not on the metrics of whatever font
 * happened to be installed.
 */
export const STUB_CHAR_WIDTH = 6;

export function createRecordingContext(): RecordingContext {
  const calls: RecordedCall[] = [];

  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    measureText: (text: string) => {
      calls.push({ method: 'measureText', args: [text] });
      return { width: text.length * STUB_CHAR_WIDTH } as TextMetrics;
    },
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) as ImageData,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
  } as unknown as Record<string, unknown>;

  for (const method of NOOP_METHODS) {
    ctx[method] = (...args: unknown[]) => {
      calls.push({ method, args });
    };
  }

  // Style properties are plain assignable fields.
  Object.assign(ctx, {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
  });

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    callsTo: (method) => calls.filter((c) => c.method === method),
    texts: () => calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0])),
    reset: () => {
      calls.length = 0;
    },
  };
}

/**
 * Make `canvas.getContext('2d')` return a stub for the rest of the test file.
 * Returns a teardown function.
 */
export function installCanvasStub(): () => void {
  const original = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string
  ) {
    if (kind !== '2d') return null;
    const recording = createRecordingContext();
    (recording.ctx as unknown as { canvas: HTMLCanvasElement }).canvas = this;
    return recording.ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

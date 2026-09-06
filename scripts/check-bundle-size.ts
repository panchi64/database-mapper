/**
 * Post-build guard on the single-file bundle.
 *
 * The whole point of this app is that `dist/index.html` is one self-contained
 * file you can email to someone. That property is easy to erode by accident —
 * one fat dependency and it doubles. This fails the build if it does.
 *
 * Ratchet BUDGET_BYTES *down* as the engine refactor removes React Flow. Never
 * raise it without saying why in the commit message.
 */
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const BUNDLE = resolve(process.cwd(), 'dist/index.html');

/**
 * Current ceiling.
 *
 * History, in bytes on disk:
 *
 *   618.9 kB  baseline, with React Flow
 *   441.7 kB  React Flow removed, replaced by the canvas engine
 *   510.7 kB  plus orthogonal routing, auto-layout, the connect picker,
 *             the SQL reader/writer, and PNG/SVG export
 *
 * So the app is ~17% smaller than it started while doing considerably more, and
 * it still has zero runtime dependencies it did not have before — routing,
 * layout and SQL are all hand-rolled precisely to keep it that way. (dagre alone
 * would have been ~90 kB; node-sql-parser ~1 MB.)
 *
 * This ceiling leaves room for the accessibility work and nothing else. Adding a
 * dependency should mean re-justifying the number, not raising it.
 */
const BUDGET_BYTES = 560 * 1024;

const size = statSync(BUNDLE).size;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

if (size > BUDGET_BYTES) {
  console.error(
    `\n  Bundle size check FAILED\n` +
      `    dist/index.html is ${kb(size)}, budget is ${kb(BUDGET_BYTES)} ` +
      `(over by ${kb(size - BUDGET_BYTES)})\n`
  );
  process.exit(1);
}

console.log(`  Bundle size OK: ${kb(size)} of ${kb(BUDGET_BYTES)} budget`);

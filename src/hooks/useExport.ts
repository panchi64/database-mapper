import { useCallback } from 'react';
import { useStore } from '@/store';
import { CanvasTextMeasurer } from '@/engine/text';
import { readPalette } from '@/engine/theme';
import { exportPng, exportSvg } from '@/engine/export/image';
import { toDDL } from '@/engine/sql/emit';
import type { SqlDialect } from '@/engine/sql/dialects';

/** Hand a blob to the browser as a download. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exporting the diagram as a picture or as SQL.
 *
 * A fresh measurer per export rather than sharing the canvas's: exports are
 * rare, and reaching into the live engine for one would couple this to whether
 * a canvas is currently mounted.
 */
export function useExport() {
  const exportImage = useCallback(async (format: 'png' | 'svg') => {
    const { nodes, edges } = useStore.getState();
    if (nodes.length === 0) return;

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;

    const input = {
      nodes,
      edges,
      palette: readPalette(),
      measurer: new CanvasTextMeasurer(ctx),
    };

    // Rasterising a very large diagram can still exceed what the browser will
    // encode. Failing loudly beats a menu item that silently does nothing.
    try {
      if (format === 'svg') {
        download(new Blob([exportSvg(input)], { type: 'image/svg+xml' }), 'diagram.svg');
        return;
      }

      download(await exportPng(input), 'diagram.png');
    } catch (err) {
      console.error('[db-mapper] Export failed:', err);
      alert(`Could not export the diagram as ${format.toUpperCase()}.`);
    }
  }, []);

  const exportSql = useCallback((dialect: SqlDialect) => {
    const { nodes, edges } = useStore.getState();
    if (nodes.length === 0) return;

    const sql = toDDL(nodes, edges, { dialect });
    download(new Blob([sql], { type: 'text/plain' }), `schema.${dialect}.sql`);
  }, []);

  return { exportImage, exportSql };
}

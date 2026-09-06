import { useCallback } from 'react';
import { useStore } from '@/store';
import { DiagramParseError, parseDiagramFile, serializeDiagram } from '@/lib/diagramFile';

export function useFileOperations() {
  const exportDiagram = useStore((state) => state.exportDiagram);
  const importDiagram = useStore((state) => state.importDiagram);

  const saveDiagram = useCallback(async () => {
    const blob = new Blob([JSON.stringify(serializeDiagram(exportDiagram()), null, 2)], {
      type: 'application/json',
    });

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'database-diagram.json',
        types: [
          {
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        throw err;
      }
    }
  }, [exportDiagram]);

  /**
   * Read, validate and load a diagram file.
   *
   * Shared by the file picker and the canvas drop target, which previously each
   * carried their own copy of the read/parse/alert dance.
   */
  const readDiagramFile = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const { diagram, warnings } = parseDiagramFile(
            JSON.parse(event.target?.result as string)
          );
          importDiagram(diagram);

          if (warnings.length > 0) {
            console.warn('[db-mapper] Diagram imported with warnings:', warnings);
          }
        } catch (err) {
          console.error('Failed to load diagram file:', err);
          alert(
            err instanceof DiagramParseError
              ? `Could not open this diagram.\n\n${err.message}`
              : 'Could not open this file — it is not valid JSON.'
          );
        }
      };

      reader.onerror = () => alert(`Could not read "${file.name}".`);
      reader.readAsText(file);
    },
    [importDiagram]
  );

  const loadDiagram = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) readDiagramFile(file);
    };
    input.click();
  }, [readDiagramFile]);

  const handleFileDrop = useCallback(
    (file: File) => {
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        readDiagramFile(file);
      }
    },
    [readDiagramFile]
  );

  return { saveDiagram, loadDiagram, handleFileDrop };
}

import { useStore } from '@/store';
import { DiagramState } from '@/types';

export function useFileOperations() {
  const exportDiagram = useStore((state) => state.exportDiagram);
  const importDiagram = useStore((state) => state.importDiagram);

  const saveDiagram = async () => {
    const data = exportDiagram();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
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
  };

  const loadDiagram = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string) as DiagramState;
            importDiagram(data);
          } catch (err) {
            alert('Invalid diagram file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return { saveDiagram, loadDiagram };
}

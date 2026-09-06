import { useCallback, useState } from 'react';

import { Toolbar } from '@/components/Toolbar';
import { PropertiesPanel } from '@/components/panels';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GlobalSearch } from '@/components/GlobalSearch';
import { OutlinePanel } from '@/components/OutlinePanel';
import { useStore } from '@/store';
import { ConnectDialog } from '@/components/dialogs/ConnectDialog';
import { CanvasApiProvider } from '@/components/canvas/CanvasApiProvider';
import { DiagramCanvas } from '@/components/canvas/DiagramCanvas';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

/**
 * Everything inside the canvas API provider.
 *
 * Split out so the keyboard shortcuts can reach the camera — paste drops nodes in
 * the middle of the current view, which only the canvas knows.
 */
function Workspace() {
  useKeyboardShortcuts();
  const showOutline = useStore((s) => s.showOutline);

  return (
    <>
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        {showOutline && <OutlinePanel />}
        <div className="flex-1 relative">
          <DiagramCanvas />
          <GlobalSearch />
        </div>
        <PropertiesPanel />
      </div>
      <ConnectDialog />
    </>
  );
}

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const { handleFileDrop } = useFileOperations();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the container itself, not a child.
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileDrop(file);
    },
    [handleFileDrop]
  );

  return (
    <ThemeProvider>
      <CanvasApiProvider>
        <div
          className="h-screen w-screen flex flex-col"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Workspace />

          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none z-50 flex items-center justify-center">
              <div className="bg-card px-6 py-4 rounded-lg shadow-lg border border-border">
                <p className="text-lg font-medium text-foreground">Drop JSON file to load diagram</p>
              </div>
            </div>
          )}
        </div>
      </CanvasApiProvider>
    </ThemeProvider>
  );
}

export default App;

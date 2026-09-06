import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/store';
import { useCanvasApi } from '@/components/canvas/canvasApi';

/** True when focus is in a text field, where shortcuts must not fire. */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el?.getAttribute('contenteditable') === 'true'
  );
}

/**
 * Global keyboard shortcuts.
 *
 * Lives outside the renderer so both the canvas engine and the React Flow
 * fallback get identical behaviour, and so paste can ask whichever surface is
 * mounted where the middle of the view currently is.
 */
export function useKeyboardShortcuts(): void {
  const canvas = useCanvasApi();

  const { deleteSelected, undo, redo, copySelectedNodes, pasteNodes, setSearchOpen, openConnect } =
    useStore(
      useShallow((state) => ({
        deleteSelected: state.deleteSelected,
        undo: state.undo,
        redo: state.redo,
        copySelectedNodes: state.copySelectedNodes,
        pasteNodes: state.pasteNodes,
        setSearchOpen: state.setSearchOpen,
        openConnect: state.openConnect,
      }))
    );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Unmodified `C` opens the connect picker. Ctrl/Cmd+C is still copy, below.
      if (e.key.toLowerCase() === 'c' && !mod && !e.altKey && !isInputFocused()) {
        e.preventDefault();
        openConnect();
        return;
      }

      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          break;

        case 'y':
          e.preventDefault();
          redo();
          break;

        case 'c':
          if (isInputFocused()) return;
          e.preventDefault();
          void copySelectedNodes();
          break;

        case 'v':
          if (isInputFocused()) return;
          e.preventDefault();
          void pasteNodes(canvas.viewportCenterWorld());
          break;

        case 'f':
          if (isInputFocused()) return;
          e.preventDefault();
          setSearchOpen(true);
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canvas, deleteSelected, undo, redo, copySelectedNodes, pasteNodes, setSearchOpen, openConnect]);
}

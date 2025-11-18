import { useState } from 'react';
import {
  Table,
  StickyNote,
  FolderOpen,
  Undo,
  Redo,
  Save,
  Upload,
  Sun,
  Moon,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/store';
import { useFileOperations } from '@/hooks/useFileOperations';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { AddTableDialog } from '@/components/dialogs/AddTableDialog';

export function Toolbar() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAddTableDialog, setShowAddTableDialog] = useState(false);

  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const addTable = useStore((state) => state.addTable);
  const addNote = useStore((state) => state.addNote);
  const addGroup = useStore((state) => state.addGroup);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const canUndo = useStore((state) => state.canUndo());
  const canRedo = useStore((state) => state.canRedo());
  const clearDiagram = useStore((state) => state.clearDiagram);

  const { saveDiagram, loadDiagram } = useFileOperations();

  const handleAddTable = () => {
    setShowAddTableDialog(true);
  };

  const handleAddTableConfirm = (name: string) => {
    // Add table at center of viewport (default position)
    const id = addTable({ x: 100, y: 100 });
    if (name && name !== 'New Table') {
      useStore.getState().updateTableName(id, name);
    }
    setShowAddTableDialog(false);
  };

  const handleAddNote = () => {
    addNote({ x: 150, y: 150 });
  };

  const handleAddGroup = () => {
    addGroup({ x: 50, y: 50 });
  };

  const handleThemeToggle = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const handleClearDiagram = () => {
    clearDiagram();
    setShowClearConfirm(false);
  };

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 p-2 border-b bg-background">
        {/* Add nodes */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleAddTable}>
              <Table className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Table</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleAddNote}>
              <StickyNote className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Note</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleAddGroup}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Group</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2 h-6" />

        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
            >
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2 h-6" />

        {/* Save/Load */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={saveDiagram}>
              <Save className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save Diagram</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={loadDiagram}>
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Load Diagram</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2 h-6" />

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleThemeToggle}>
              {isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Toggle Theme ({theme})</p>
          </TooltipContent>
        </Tooltip>

        {/* Clear diagram */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clear Diagram</p>
          </TooltipContent>
        </Tooltip>

        {/* Confirm clear dialog */}
        <ConfirmDialog
          open={showClearConfirm}
          onOpenChange={setShowClearConfirm}
          title="Clear Diagram"
          description="Are you sure you want to clear the entire diagram? This action cannot be undone."
          confirmLabel="Clear"
          onConfirm={handleClearDiagram}
          destructive
        />

        {/* Add table dialog */}
        <AddTableDialog
          open={showAddTableDialog}
          onOpenChange={setShowAddTableDialog}
          onConfirm={handleAddTableConfirm}
        />
      </div>
    </TooltipProvider>
  );
}

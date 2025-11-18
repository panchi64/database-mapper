import { useState } from 'react';
import {
  Table,
  StickyNote,
  FolderOpen,
  Undo,
  Redo,
  Save,
  FolderInput,
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
import { KeyboardShortcutsDialog } from '@/components/dialogs';

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
        {/* Left side - File & Edit Operations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={saveDiagram}>
              <Save className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save Diagram</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={loadDiagram}>
              <FolderInput className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Load Diagram</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="toolbar"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
            >
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo (Ctrl+Z)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="toolbar"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (Ctrl+Shift+Z)</p>
          </TooltipContent>
        </Tooltip>

        {/* Flex spacer to center creation actions */}
        <div className="flex-1" />

        {/* Center - Creation Actions */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={handleAddTable}>
              <Table className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Table</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={handleAddNote}>
              <StickyNote className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Note</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={handleAddGroup}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add Group</p>
          </TooltipContent>
        </Tooltip>

        {/* Flex spacer to push remaining items to right */}
        <div className="flex-1" />

        {/* Right side - Destructive, Help & Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="toolbar"
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clear Diagram</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <KeyboardShortcutsDialog />

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="icon" onClick={handleThemeToggle}>
              {isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{theme === 'dark' ? 'Switch to System' : theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}</p>
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

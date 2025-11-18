import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Table,
  StickyNote,
  FolderOpen,
  Undo,
  Redo,
  Save,
  Sun,
  Moon,
  Trash2,
  Group,
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

  const { getViewport } = useReactFlow();

  const getViewportCenter = () => {
    const viewport = getViewport();

    // Get the actual React Flow canvas dimensions
    const reactFlowContainer = document.querySelector('.react-flow') as HTMLElement;
    const canvasWidth = reactFlowContainer?.offsetWidth ?? window.innerWidth;
    const canvasHeight = reactFlowContainer?.offsetHeight ?? window.innerHeight;

    const centerX = (-viewport.x + canvasWidth / 2) / viewport.zoom;
    const centerY = (-viewport.y + canvasHeight / 2) / viewport.zoom;
    return { x: centerX, y: centerY };
  };

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
    const id = addTable(getViewportCenter());
    if (name && name !== 'New Table') {
      useStore.getState().updateTableName(id, name);
    }
    setShowAddTableDialog(false);
  };

  const handleAddNote = () => {
    addNote(getViewportCenter());
  };

  const handleAddGroup = () => {
    addGroup(getViewportCenter());
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
        {/* File Section */}
        <div className="flex items-center gap-1">
          <span className="hidden lg:block text-[10px] text-muted-foreground uppercase tracking-wider px-1 mr-1">File</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="toolbar" size="toolbarIcon" onClick={saveDiagram}>
                <Save className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Save</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save Diagram</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="toolbar" size="toolbarIcon" onClick={loadDiagram}>
                <FolderOpen className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Load</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Load Diagram</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Edit Section */}
        <div className="flex items-center gap-1">
          <span className="hidden lg:block text-[10px] text-muted-foreground uppercase tracking-wider px-1 mr-1">Edit</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="toolbar"
                size="toolbarIcon"
                onClick={undo}
                disabled={!canUndo}
              >
                <Undo className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Undo</span>
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
                size="toolbarIcon"
                onClick={redo}
                disabled={!canRedo}
              >
                <Redo className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Redo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo (Ctrl+Shift+Z)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Flex spacer to center creation actions */}
        <div className="flex-1" />

        {/* Create Section */}
        <div className="flex items-center gap-1">
          <span className="hidden lg:block text-[10px] text-muted-foreground uppercase tracking-wider px-1 mr-1">Create</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="toolbar" size="toolbarIcon" onClick={handleAddTable}>
                <Table className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Table</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add Table</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="toolbar" size="toolbarIcon" onClick={handleAddNote}>
                <StickyNote className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Note</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add Note</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="toolbar" size="toolbarIcon" onClick={handleAddGroup}>
                <Group className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Group</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add Group</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Flex spacer to push remaining items to right */}
        <div className="flex-1" />

        {/* Actions Section */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="toolbar"
                size="toolbarIcon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Clear</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear Diagram</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <KeyboardShortcutsDialog />

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="toolbarIcon" onClick={handleThemeToggle}>
              {isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              <span className="hidden lg:inline-block ml-2">Theme</span>
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

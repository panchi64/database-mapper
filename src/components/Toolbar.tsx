import { useState } from 'react';
import {
  Table,
  StickyNote,
  Link2,
  LayoutGrid,
  Download,
  FileCode,
  PanelLeft,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCanvasApi } from '@/components/canvas/canvasApi';
import { useStore } from '@/store';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useExport } from '@/hooks/useExport';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { AddTableDialog } from '@/components/dialogs/AddTableDialog';
import { ImportSqlDialog } from '@/components/dialogs/ImportSqlDialog';
import { KeyboardShortcutsDialog } from '@/components/dialogs';

export function Toolbar() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAddTableDialog, setShowAddTableDialog] = useState(false);
  const [showImportSql, setShowImportSql] = useState(false);

  const canvas = useCanvasApi();

  // New nodes land in the middle of what the user is currently looking at. The
  // canvas owns this; it used to be measured off the React Flow container element.
  const getViewportCenter = () => canvas.viewportCenterWorld();

  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const addTable = useStore((state) => state.addTable);
  const addNote = useStore((state) => state.addNote);
  const openConnect = useStore((state) => state.openConnect);
  const arrange = useStore((state) => state.arrange);
  const { exportImage, exportSql } = useExport();
  const showOutline = useStore((state) => state.showOutline);
  const toggleOutline = useStore((state) => state.toggleOutline);
  const hasNodes = useStore((state) => state.nodes.length > 0);
  const hasMultiSelection = useStore((state) => state.selectedNodeIds.size > 1);
  // Connecting needs something to connect: two tables at minimum.
  const hasTwoTables = useStore((state) => state.nodes.filter((n) => n.type === 'table').length >= 2);
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
              <Button
                variant="toolbar"
                size="toolbarIcon"
                aria-pressed={showOutline}
                onClick={toggleOutline}
              >
                <PanelLeft className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Outline</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{showOutline ? 'Hide' : 'Show'} the diagram outline</p>
            </TooltipContent>
          </Tooltip>

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

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="toolbar" size="toolbarIcon" disabled={!hasNodes}>
                    <Download className="h-4 w-4" />
                    <span className="hidden lg:inline-block ml-2">Export</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Export the diagram</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => void exportImage('png')}>PNG image</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportImage('svg')}>SVG image</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportSql('postgres')}>SQL — PostgreSQL</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSql('mysql')}>SQL — MySQL</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSql('sqlite')}>SQL — SQLite</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="toolbar"
                size="toolbarIcon"
                onClick={() => setShowImportSql(true)}
              >
                <FileCode className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">SQL</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Import from SQL</p>
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
              <Button
                variant="toolbar"
                size="toolbarIcon"
                onClick={() => openConnect()}
                disabled={!hasTwoTables}
              >
                <Link2 className="h-4 w-4" />
                <span className="hidden lg:inline-block ml-2">Connect</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add Relationship (C)</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="toolbar" size="toolbarIcon" disabled={!hasNodes}>
                    <LayoutGrid className="h-4 w-4" />
                    <span className="hidden lg:inline-block ml-2">Arrange</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Auto-arrange the diagram</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => arrange('layered-lr')}>
                Layered, left to right
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => arrange('layered-tb')}>
                Layered, top to bottom
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => arrange('grid')}>Grid</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!hasMultiSelection}
                onClick={() => arrange('layered-lr', true)}
              >
                Selection only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

        <ImportSqlDialog open={showImportSql} onOpenChange={setShowImportSql} />
      </div>
    </TooltipProvider>
  );
}

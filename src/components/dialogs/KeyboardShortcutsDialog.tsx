import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function KeyboardShortcutsDialog() {
  const shortcuts = [
    { keys: 'Delete', description: 'Delete selected item' },
    { keys: 'Backspace', description: 'Delete selected item' },
    { keys: 'Ctrl + Z', description: 'Undo last action' },
    { keys: 'Ctrl + Shift + Z', description: 'Redo last action' },
    { keys: 'Ctrl + Y', description: 'Redo last action' },
    { keys: 'Scroll', description: 'Zoom in/out' },
    { keys: 'Click + Drag', description: 'Pan canvas' },
    { keys: 'Click node', description: 'Select node' },
    { keys: 'Click edge', description: 'Select relationship' },
  ];

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Keyboard className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Keyboard Shortcuts</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-muted-foreground">
                {shortcut.description}
              </span>
              <kbd className="px-2 py-1 text-xs font-mono bg-muted text-foreground rounded">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

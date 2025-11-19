import { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { GroupNodeData } from '@/types';

interface GroupNodeProps {
  data: GroupNodeData;
  selected?: boolean;
  id: string;
}

// Color mapping for group backgrounds (semi-transparent)
const colorMap: Record<string, { bg: string; border: string; header: string; text: string }> = {
  slate: {
    bg: 'bg-slate-50/80 dark:bg-slate-800/50',
    border: 'border-slate-300 dark:border-slate-600',
    header: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
  },
  blue: {
    bg: 'bg-blue-50/80 dark:bg-blue-900/40',
    border: 'border-blue-300 dark:border-blue-700',
    header: 'bg-blue-100 dark:bg-blue-900/50',
    text: 'text-blue-700 dark:text-blue-300',
  },
  green: {
    bg: 'bg-green-50/80 dark:bg-green-900/40',
    border: 'border-green-300 dark:border-green-700',
    header: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-700 dark:text-green-300',
  },
  purple: {
    bg: 'bg-purple-50/80 dark:bg-purple-900/40',
    border: 'border-purple-300 dark:border-purple-700',
    header: 'bg-purple-100 dark:bg-purple-900/50',
    text: 'text-purple-700 dark:text-purple-300',
  },
  orange: {
    bg: 'bg-orange-50/80 dark:bg-orange-900/40',
    border: 'border-orange-300 dark:border-orange-700',
    header: 'bg-orange-100 dark:bg-orange-900/50',
    text: 'text-orange-700 dark:text-orange-300',
  },
  red: {
    bg: 'bg-red-50/80 dark:bg-red-900/40',
    border: 'border-red-300 dark:border-red-700',
    header: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-700 dark:text-red-300',
  },
};

export const GroupNode = memo(({ data, selected, id }: GroupNodeProps) => {
  const color = data.color || 'slate';
  const colorClasses = colorMap[color] || colorMap.slate;

  const { copySelectedNodes, deleteNode, setSelectedNode } = useStore(
    useShallow((state) => ({
      copySelectedNodes: state.copySelectedNodes,
      deleteNode: state.deleteNode,
      setSelectedNode: state.setSelectedNode,
    }))
  );

  const handleCopy = () => {
    setSelectedNode(id);
    setTimeout(() => copySelectedNodes(), 0);
  };

  const handleDelete = () => {
    deleteNode(id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full h-full">
          {/* Resizer handles - only show when selected */}
          <NodeResizer
            minWidth={200}
            minHeight={100}
            isVisible={selected}
            lineClassName="!border-blue-500"
            handleClassName="!w-2 !h-2 !bg-blue-500 !border-white"
          />

          {/* Group container */}
          <div
            className={cn(
              'w-full h-full rounded-lg border-2 border-dashed',
              colorClasses.bg,
              colorClasses.border,
              selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
          >
            {/* Header */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-t-md',
                colorClasses.header
              )}
            >
              <Folder className={cn('w-4 h-4', colorClasses.text)} />
              <span className={cn('font-semibold text-sm', colorClasses.text)}>
                {data.name}
              </span>
            </div>

            {/* Content area */}
            <div className="p-2 min-h-[60px]">
              {/* This area is intentionally empty - child nodes are rendered by React Flow */}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleCopy}>
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

GroupNode.displayName = 'GroupNode';

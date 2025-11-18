import { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import type { GroupNodeData } from '@/types';

interface GroupNodeProps {
  data: GroupNodeData;
  selected?: boolean;
  id: string;
}

// Color mapping for group backgrounds (semi-transparent)
const colorMap: Record<string, { bg: string; border: string; header: string; text: string }> = {
  slate: {
    bg: 'bg-slate-50/50 dark:bg-slate-800/30 backdrop-blur-sm',
    border: 'border-slate-300 dark:border-slate-600',
    header: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
  },
  blue: {
    bg: 'bg-blue-50/50 dark:bg-blue-900/20 backdrop-blur-sm',
    border: 'border-blue-300 dark:border-blue-700',
    header: 'bg-blue-100 dark:bg-blue-900/50',
    text: 'text-blue-700 dark:text-blue-300',
  },
  green: {
    bg: 'bg-green-50/50 dark:bg-green-900/20 backdrop-blur-sm',
    border: 'border-green-300 dark:border-green-700',
    header: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-700 dark:text-green-300',
  },
  purple: {
    bg: 'bg-purple-50/50 dark:bg-purple-900/20 backdrop-blur-sm',
    border: 'border-purple-300 dark:border-purple-700',
    header: 'bg-purple-100 dark:bg-purple-900/50',
    text: 'text-purple-700 dark:text-purple-300',
  },
  orange: {
    bg: 'bg-orange-50/50 dark:bg-orange-900/20 backdrop-blur-sm',
    border: 'border-orange-300 dark:border-orange-700',
    header: 'bg-orange-100 dark:bg-orange-900/50',
    text: 'text-orange-700 dark:text-orange-300',
  },
  red: {
    bg: 'bg-red-50/50 dark:bg-red-900/20 backdrop-blur-sm',
    border: 'border-red-300 dark:border-red-700',
    header: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-700 dark:text-red-300',
  },
};

export const GroupNode = memo(({ data, selected, id }: GroupNodeProps) => {
  const color = data.color || 'slate';
  const colorClasses = colorMap[color] || colorMap.slate;
  const isCollapsed = data.collapsed ?? false;
  const toggleGroupCollapse = useStore((state) => state.toggleGroupCollapse);

  return (
    <>
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
            'flex items-center gap-2 px-3 py-2 rounded-t-md cursor-pointer',
            colorClasses.header
          )}
        >
          {/* Collapse toggle */}
          <button
            className={cn(
              'p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
              colorClasses.text
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleGroupCollapse(id);
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Folder icon */}
          <Folder className={cn('w-4 h-4', colorClasses.text)} />

          {/* Group name */}
          <span className={cn('font-semibold text-sm', colorClasses.text)}>
            {data.name}
          </span>
        </div>

        {/* Content area - other nodes can be placed inside */}
        {!isCollapsed && (
          <div className="p-2 min-h-[60px]">
            {/* This area is intentionally empty - child nodes are rendered by React Flow */}
          </div>
        )}
      </div>
    </>
  );
});

GroupNode.displayName = 'GroupNode';

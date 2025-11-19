import { memo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Key, Link } from 'lucide-react';
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
import type { TableNodeData, Column } from '@/types';

interface TableNodeProps {
  data: TableNodeData;
  selected?: boolean;
  id: string;
}

// Color mapping for table header backgrounds
const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-900 dark:text-slate-100',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-900 dark:text-blue-100',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-900 dark:text-green-100',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-900 dark:text-purple-100',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-900 dark:text-orange-100',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900',
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-900 dark:text-red-100',
  },
};

interface ColumnRowProps {
  column: Column;
}

const ColumnRow = memo(({ column }: ColumnRowProps) => {
  const dataTypeDisplay = column.length
    ? `${column.dataType}(${column.length})`
    : column.dataType;

  return (
    <div
      className={cn(
        'relative flex items-center justify-between px-3 py-1.5 text-xs',
        'border-b border-border last:border-b-0',
        'hover:bg-muted/50 transition-colors'
      )}
    >
      {/* Left handle for this column */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${column.id}-left`}
        className={cn(
          '!w-2 !h-2 !bg-muted-foreground',
          '!border-2 !border-card',
          'hover:!bg-blue-500 transition-colors'
        )}
        style={{ top: '50%' }}
      />

      {/* Column info */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {/* Primary key indicator */}
        {column.primaryKey && (
          <Key className="w-3 h-3 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
        )}

        {/* Foreign key indicator */}
        {column.foreignKey && (
          <span className="px-1 py-0.5 text-[9px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded flex-shrink-0">
            FK
          </span>
        )}

        {/* Column name */}
        <span
          className={cn(
            'font-medium truncate text-white'
          )}
        >
          {column.name}
        </span>

        {/* Nullable indicator */}
        {column.nullable && (
          <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">?</span>
        )}

        {/* Unique indicator */}
        {column.unique && !column.primaryKey && (
          <span className="px-1 py-0.5 text-[9px] font-semibold bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded flex-shrink-0">
            U
          </span>
        )}
      </div>

      {/* Data type */}
      <span className="text-slate-500 dark:text-slate-400 text-[10px] ml-2 flex-shrink-0">
        {dataTypeDisplay}
      </span>

      {/* Right handle for this column */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${column.id}-right`}
        className={cn(
          '!w-2 !h-2 !bg-muted-foreground',
          '!border-2 !border-card',
          'hover:!bg-blue-500 transition-colors'
        )}
        style={{ top: '50%' }}
      />
    </div>
  );
});

ColumnRow.displayName = 'ColumnRow';

export const TableNode = memo(({ data, selected, id }: TableNodeProps) => {
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
    // Ensure this node is selected before copying
    setSelectedNode(id);
    // Small delay to ensure selection is registered
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
            minHeight={150}
            isVisible={selected}
            lineClassName="!border-blue-500"
            handleClassName="!w-2 !h-2 !bg-blue-500 !border-white"
          />

          <div
            className={cn(
              'w-full h-full min-w-[200px] overflow-hidden flex flex-col',
              'bg-white dark:bg-slate-900',
              'border rounded-lg shadow-md',
              'border-border',
              selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
          >
      {/* Top handle for general connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={cn(
          '!w-3 !h-3 !bg-muted-foreground',
          '!border-2 !border-card',
          'hover:!bg-blue-500 transition-colors'
        )}
      />

      {/* Table header */}
      <div
        className={cn(
          'px-3 py-2 rounded-t-lg border-b',
          colorClasses.bg,
          colorClasses.border
        )}
      >
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h3
            className={cn(
              'font-semibold text-sm truncate',
              colorClasses.text
            )}
          >
            {data.name}
          </h3>
        </div>
        {data.comment && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            {data.comment}
          </p>
        )}
      </div>

      {/* Columns list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-900">
        {data.columns.length > 0 ? (
          data.columns.map((column) => (
            <ColumnRow key={column.id} column={column} />
          ))
        ) : (
          <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">
            No columns defined
          </div>
        )}
      </div>

          {/* Bottom handle for general connections */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="bottom"
            className={cn(
              '!w-3 !h-3 !bg-muted-foreground',
              '!border-2 !border-card',
              'hover:!bg-blue-500 transition-colors'
            )}
          />
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

TableNode.displayName = 'TableNode';

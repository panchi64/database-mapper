import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { NodeResizer, Handle, Position } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
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
import type { NoteNodeData } from '@/types';

interface NoteNodeProps {
  data: NoteNodeData;
  selected?: boolean;
  id: string;
}

// Color mapping for sticky note backgrounds
const colorMap: Record<string, { bg: string; border: string; text: string; placeholder: string }> = {
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-900/60',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-900 dark:text-slate-100',
    placeholder: 'placeholder-slate-500 dark:placeholder-slate-600',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900/60',
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-900 dark:text-red-100',
    placeholder: 'placeholder-red-500 dark:placeholder-red-600',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/60',
    border: 'border-yellow-300 dark:border-yellow-700',
    text: 'text-yellow-900 dark:text-yellow-100',
    placeholder: 'placeholder-yellow-500 dark:placeholder-yellow-600',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/60',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-900 dark:text-blue-100',
    placeholder: 'placeholder-blue-500 dark:placeholder-blue-600',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/60',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-900 dark:text-green-100',
    placeholder: 'placeholder-green-500 dark:placeholder-green-600',
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-900/60',
    border: 'border-pink-300 dark:border-pink-700',
    text: 'text-pink-900 dark:text-pink-100',
    placeholder: 'placeholder-pink-500 dark:placeholder-pink-600',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/60',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-900 dark:text-purple-100',
    placeholder: 'placeholder-purple-500 dark:placeholder-purple-600',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900/60',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-900 dark:text-orange-100',
    placeholder: 'placeholder-orange-500 dark:placeholder-orange-600',
  },
};

export const NoteNode = memo(({ data, selected, id }: NoteNodeProps) => {
  const color = data.color || 'yellow';
  const colorClasses = colorMap[color] || colorMap.yellow;
  const { updateNoteContent, updateNoteName, copySelectedNodes, deleteNode, setSelectedNode } = useStore(
    useShallow((state) => ({
      updateNoteContent: state.updateNoteContent,
      updateNoteName: state.updateNoteName,
      copySelectedNodes: state.copySelectedNodes,
      deleteNode: state.deleteNode,
      setSelectedNode: state.setSelectedNode,
    }))
  );

  const handleCopyNode = () => {
    setSelectedNode(id);
    setTimeout(() => copySelectedNodes(), 0);
  };

  const handleDeleteNode = () => {
    deleteNode(id);
  };

  // Local state for editing content
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Local state for editing name
  const [isEditingName, setIsEditingName] = useState(false);
  const [localName, setLocalName] = useState(data.name || 'Note');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync local state with data when it changes externally
  useEffect(() => {
    setContent(data.content);
  }, [data.content]);

  // Sync name with data when it changes externally
  useEffect(() => {
    setLocalName(data.name || 'Note');
  }, [data.name]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  // Focus name input when entering name edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // Save content to store
    if (content !== data.content) {
      updateNoteContent(id, content);
    }
  }, [content, data.content, id, updateNoteContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Exit edit mode on Escape
    if (e.key === 'Escape') {
      setIsEditing(false);
      setContent(data.content); // Revert changes
    }
    // Prevent node deletion when typing
    e.stopPropagation();
  }, [data.content]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  // Name editing handlers
  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
  }, []);

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (localName !== (data.name || 'Note')) {
      updateNoteName(id, localName);
    }
  }, [localName, data.name, id, updateNoteName]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsEditingName(false);
      setLocalName(data.name || 'Note');
    } else if (e.key === 'Enter') {
      setIsEditingName(false);
      if (localName !== (data.name || 'Note')) {
        updateNoteName(id, localName);
      }
    }
    e.stopPropagation();
  }, [data.name, localName, id, updateNoteName]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full h-full">
          {/* Resizer handles - only show when selected */}
          <NodeResizer
            minWidth={150}
            minHeight={100}
            isVisible={selected}
            lineClassName="!border-blue-500"
            handleClassName="!w-2 !h-2 !bg-blue-500 !border-white"
          />

          {/* Single connection handle for linking to tables - Blue circle (source) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="note"
            className="!w-3 !h-3 !bg-blue-400 dark:!bg-blue-500 !border-2 !border-white dark:!border-slate-800 !rounded-full"
          />

          {/* Note container */}
          <div
            className={cn(
              'w-full h-full rounded-md border shadow-md',
              colorClasses.bg,
              colorClasses.border,
              selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
            onDoubleClick={handleDoubleClick}
          >
        {/* Header with icon */}
        <div className={cn('flex items-center gap-2 px-3 py-2 border-b', colorClasses.border)}>
          <StickyNote className={cn('w-4 h-4 flex-shrink-0', colorClasses.text)} />
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={localName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className={cn(
                'text-xs font-medium bg-transparent border-none outline-none w-full',
                colorClasses.text
              )}
            />
          ) : (
            <span
              className={cn('text-xs font-medium cursor-pointer truncate', colorClasses.text)}
              onDoubleClick={handleNameDoubleClick}
            >
              {data.name || 'Note'}
            </span>
          )}
        </div>

        {/* Content area */}
        <div className="p-3 h-[calc(100%-36px)]">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className={cn(
                'w-full h-full resize-none border-none bg-transparent outline-none',
                'text-sm leading-relaxed',
                colorClasses.text,
                colorClasses.placeholder
              )}
              placeholder="Type your note here..."
            />
          ) : (
            <div
              className={cn(
                'w-full h-full text-sm leading-relaxed whitespace-pre-wrap break-words overflow-auto',
                colorClasses.text,
                !content && 'opacity-50 italic'
              )}
            >
              {content || 'Double-click to edit...'}
            </div>
            )}
          </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleCopyNode}>
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDeleteNode} className="text-red-600 dark:text-red-400">
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

NoteNode.displayName = 'NoteNode';

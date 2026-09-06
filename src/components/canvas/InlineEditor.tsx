/**
 * Editing text on top of the canvas.
 *
 * A canvas cannot hold a caret, so double-clicking a name floats a real
 * `<input>`/`<textarea>` over the spot the text occupies. Exactly one is alive at
 * a time, positioned in screen space and scaled with the viewport so it lines up
 * with what it is covering.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FONTS, METRICS, type Rect } from '@/engine/geometry';
import { toScreen, type ViewportController } from '@/engine/viewport';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

export type InlineEditKind = 'name' | 'note-content';

export interface InlineEdit {
  kind: InlineEditKind;
  nodeId: string;
  /** World-space rect of the node being edited. */
  rect: Rect;
}

interface Props {
  edit: InlineEdit;
  viewport: ViewportController;
  onClose: () => void;
}

export function InlineEditor({ edit, viewport, onClose }: Props) {
  const node = useStore((s) => s.nodes.find((n) => n.id === edit.nodeId));
  const updateTableName = useStore((s) => s.updateTableName);
  const updateGroupName = useStore((s) => s.updateGroupName);
  const updateNoteName = useStore((s) => s.updateNoteName);
  const updateNoteContent = useStore((s) => s.updateNoteContent);

  const initial =
    node == null
      ? ''
      : edit.kind === 'note-content' && node.type === 'note'
        ? node.data.content
        : node.data.name;

  const [value, setValue] = useState(initial);
  const [, forceUpdate] = useState(0);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Follow the camera: the overlay is positioned in screen space, so any pan or
  // zoom has to move it.
  useEffect(() => viewport.subscribe(() => forceUpdate((n) => n + 1)), [viewport]);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  if (!node) return null;

  const commit = () => {
    const trimmed = edit.kind === 'note-content' ? value : value.trim();

    if (trimmed !== initial) {
      if (edit.kind === 'note-content') updateNoteContent(node.id, trimmed);
      else if (node.type === 'table') updateTableName(node.id, trimmed);
      else if (node.type === 'group') updateGroupName(node.id, trimmed);
      else updateNoteName(node.id, trimmed);
    }

    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape abandons the edit; Enter commits, except in a note body where it
    // has to stay available for line breaks.
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (edit.kind !== 'note-content' || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
    e.stopPropagation();
  };

  const vp = viewport.get();
  const origin = toScreen({ x: edit.rect.x, y: edit.rect.y }, vp);
  const isBody = edit.kind === 'note-content';

  const style: React.CSSProperties = {
    position: 'absolute',
    left: origin.x,
    top: origin.y + (isBody ? 34 : 0),
    width: edit.rect.w,
    height: isBody ? edit.rect.h - 44 : METRICS.headerH,
    // Scale rather than recompute font sizes, so the overlay matches the painted
    // text at any zoom without a second layout model.
    transform: `scale(${vp.zoom})`,
    transformOrigin: 'top left',
    font: isBody ? FONTS.note : FONTS.title,
    padding: `0 ${METRICS.padX}px`,
  };

  const className = cn(
    'z-20 resize-none rounded-md border-2 border-blue-500 bg-card text-foreground',
    'outline-none shadow-lg'
  );

  return isBody ? (
    <textarea
      ref={ref as React.RefObject<HTMLTextAreaElement>}
      className={cn(className, 'py-2')}
      style={style}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  ) : (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      className={className}
      style={style}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

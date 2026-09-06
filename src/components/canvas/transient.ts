import type { TransientState } from '@/engine/interactions';
import type { DBNode } from '@/types';

/**
 * Apply in-flight drag and resize offsets to the node list.
 *
 * A drag doesn't touch the store until it commits on pointer-up, so the frame
 * being painted has to combine committed state with the live offset. Returns the
 * original array untouched when nothing is in flight, which is the common case and
 * keeps the render path allocation-free.
 */
export function applyTransient(nodes: readonly DBNode[], t: TransientState): readonly DBNode[] {
  if (!t.dragDelta && !t.resizePreview) return nodes;

  return nodes.map((node) => {
    if (t.resizePreview?.nodeId === node.id) {
      const r = t.resizePreview.rect;
      return { ...node, x: r.x, y: r.y, w: r.w, h: r.h };
    }

    if (t.dragDelta && t.draggingIds.has(node.id)) {
      return { ...node, x: node.x + t.dragDelta.x, y: node.y + t.dragDelta.y };
    }

    return node;
  });
}

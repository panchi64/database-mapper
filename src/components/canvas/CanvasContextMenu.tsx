/**
 * One context menu for the whole canvas.
 *
 * Each node used to wrap itself in its own `ContextMenuTrigger`, which only worked
 * because every node was a DOM element. With a single canvas there is one trigger,
 * and the engine hit-tests on `contextmenu` *before* Radix opens so the menu can
 * describe whatever was actually clicked.
 */
import { useMemo } from 'react';
import { Copy, Link2, Pencil, Spline, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { Hit } from '@/engine/hitTest';
import { nodeRect } from '@/engine/geometry';
import type { Point } from '@/engine/geometry';
import { useStore } from '@/store';
import type { InlineEdit } from './InlineEditor';

interface Props {
  menu: { hit: Hit | null; at: Point } | null;
  onOpenChange: (open: boolean) => void;
  onStartEdit: (edit: InlineEdit) => void;
  children: React.ReactNode;
}

function hitNodeId(hit: Hit | null): string | null {
  if (!hit) return null;
  return 'nodeId' in hit ? hit.nodeId : null;
}

export function CanvasContextMenu({ menu, onOpenChange, onStartEdit, children }: Props) {
  const nodes = useStore((s) => s.nodes);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const copySelectedNodes = useStore((s) => s.copySelectedNodes);
  const selectNode = useStore((s) => s.selectNode);
  const deleteColumn = useStore((s) => s.deleteColumn);
  const openConnect = useStore((s) => s.openConnect);
  const setEdgeWaypoints = useStore((s) => s.setEdgeWaypoints);
  const edges = useStore((s) => s.edges);

  const nodeId = hitNodeId(menu?.hit ?? null);
  const node = useMemo(() => nodes.find((n) => n.id === nodeId), [nodes, nodeId]);

  const hit = menu?.hit ?? null;
  const columnId = hit && hit.kind === 'row' ? hit.columnId : null;

  // An edge, or one of its drag handles, all act on the same relationship.
  const edgeId =
    hit && (hit.kind === 'edge' || hit.kind === 'waypoint' || hit.kind === 'edgeEnd')
      ? hit.edgeId
      : null;
  const hasWaypoints = Boolean(
    edgeId && (edges.find((e) => e.id === edgeId)?.waypoints?.length ?? 0) > 0
  );

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent>
        {node && (
          <>
            <ContextMenuItem
              onClick={() => {
                selectNode(node.id, false);
                onStartEdit({ kind: 'name', nodeId: node.id, rect: nodeRect(node) });
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => {
                selectNode(node.id, false);
                void copySelectedNodes();
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>

            {node.type !== 'group' && (
              <ContextMenuItem
                // Prefilled with whatever was clicked: the column if the pointer
                // was over a row, otherwise the table itself.
                onClick={() =>
                  openConnect({
                    source: { nodeId: node.id, ...(columnId ? { columnId } : {}) },
                  })
                }
              >
                <Link2 className="mr-2 h-4 w-4" />
                {columnId ? 'Connect this column…' : 'Connect to…'}
                <ContextMenuShortcut>C</ContextMenuShortcut>
              </ContextMenuItem>
            )}

            {columnId && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => deleteColumn(node.id, columnId)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete column
                </ContextMenuItem>
              </>
            )}

            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => deleteNode(node.id)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {node.type}
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}

        {edgeId && (
          <>
            <ContextMenuItem disabled>
              <Link2 className="mr-2 h-4 w-4" />
              Relationship
            </ContextMenuItem>

            {hasWaypoints && (
              <ContextMenuItem onClick={() => setEdgeWaypoints(edgeId, [])}>
                <Spline className="mr-2 h-4 w-4" />
                Reset route
              </ContextMenuItem>
            )}

            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => deleteEdge(edgeId)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete relationship
            </ContextMenuItem>
          </>
        )}

        {!node && !edgeId && <ContextMenuItem disabled>Nothing selected</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}

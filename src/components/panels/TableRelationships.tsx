/**
 * The relationships a table takes part in, listed in its properties panel.
 *
 * Two jobs: make a table's connections readable without tracing lines across the
 * canvas, and put "add a relationship" somewhere a user looking at a table will
 * actually find it.
 */
import { Link2, Plus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { PanelSection } from './PanelSection';
import type { DBEdge, DBNode } from '@/types';

/** How one end of an edge reads, from the perspective of `nodeId`. */
function endpointLabel(edge: DBEdge, which: 'source' | 'target', nodes: DBNode[]): string {
  const ref = edge[which];
  const node = nodes.find((n) => n.id === ref.nodeId);
  if (!node) return 'unknown';

  const name = node.data.name;
  if (!ref.columnId || node.type !== 'table') return name;

  const column = node.data.columns.find((c) => c.id === ref.columnId);
  return column ? `${name}.${column.name}` : name;
}

export function TableRelationships({ nodeId }: { nodeId: string }) {
  const { nodes, edges, openConnect, setSelectedEdge, deleteEdge } = useStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      openConnect: s.openConnect,
      setSelectedEdge: s.setSelectedEdge,
      deleteEdge: s.deleteEdge,
    }))
  );

  const related = edges.filter(
    (e) => e.source.nodeId === nodeId || e.target.nodeId === nodeId
  );

  return (
    <PanelSection
      title="Relationships"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openConnect({ source: { nodeId } })}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      }
    >
      {related.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          No relationships yet. Use <span className="font-medium">Add</span>, or press{' '}
          <kbd className="rounded border border-border px-1 text-[10px]">C</kbd>.
        </p>
      )}

      {related.map((edge) => {
        const outgoing = edge.source.nodeId === nodeId;

        return (
          <div
            key={edge.id}
            className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
          >
            <Link2
              className={outgoing ? 'h-3.5 w-3.5 text-blue-500' : 'h-3.5 w-3.5 text-amber-500'}
              aria-label={outgoing ? 'references' : 'referenced by'}
            />

            <button
              type="button"
              onClick={() => setSelectedEdge(edge.id)}
              className="min-w-0 flex-1 truncate text-left hover:underline"
              title={`${endpointLabel(edge, 'source', nodes)} → ${endpointLabel(edge, 'target', nodes)}`}
            >
              <span className="text-muted-foreground">{outgoing ? 'to ' : 'from '}</span>
              {endpointLabel(edge, outgoing ? 'target' : 'source', nodes)}
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Delete relationship"
              onClick={() => deleteEdge(edge.id)}
            >
              <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
            </Button>
          </div>
        );
      })}
    </PanelSection>
  );
}

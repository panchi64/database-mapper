/**
 * A DOM tree of the diagram.
 *
 * A canvas has no accessibility tree and no selectable text, and an offscreen
 * mirror built purely for screen readers would re-pay the DOM cost the canvas
 * exists to avoid. So instead of a hidden mirror, this is a real, visible panel:
 * keyboard- and screen-reader-navigable, and useful to everyone as a way to find
 * a table in a large schema and to copy names out.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, KeyRound, Link2, StickyNote, Table2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { useCanvasApi } from '@/components/canvas/canvasApi';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DBNode, TableNode } from '@/types';

function matches(node: DBNode, query: string): boolean {
  if (!query) return true;

  const q = query.toLowerCase();
  if (node.data.name.toLowerCase().includes(q)) return true;

  return node.type === 'table'
    ? node.data.columns.some((c) => c.name.toLowerCase().includes(q))
    : false;
}

export function OutlinePanel() {
  const { nodes, edges, selectedNodeId, setSelectedNode } = useStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      selectedNodeId: s.selectedNodeId,
      setSelectedNode: s.setSelectedNode,
    }))
  );

  const canvas = useCanvasApi();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () =>
      nodes
        .filter((n) => n.type !== 'group' && matches(n, query))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
    [nodes, query]
  );

  const relationshipCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) {
      for (const id of [edge.source.nodeId, edge.target.nodeId]) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [edges]);

  const reveal = (nodeId: string) => {
    setSelectedNode(nodeId);
    canvas.centerOnNode(nodeId);
  };

  const toggle = (nodeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  return (
    <nav aria-label="Diagram outline" className="flex h-full w-64 flex-col border-r bg-background">
      <div className="border-b border-border p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tables…"
          aria-label="Filter the outline"
          className="h-8 text-xs"
        />
      </div>

      <ScrollArea className="flex-1">
        <ul className="p-1">
          {visible.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              {nodes.length === 0 ? 'Nothing in the diagram yet' : 'No matches'}
            </li>
          )}

          {visible.map((node) => {
            const isTable = node.type === 'table';
            const columns = isTable ? (node as TableNode).data.columns : [];
            const isOpen = expanded.has(node.id) || (query !== '' && isTable);

            return (
              <li key={node.id}>
                <div
                  className={cn(
                    'flex items-center gap-1 rounded px-1',
                    selectedNodeId === node.id && 'bg-primary/10'
                  )}
                >
                  {isTable && columns.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(node.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.data.name}`}
                      className="rounded p-0.5 hover:bg-accent"
                    >
                      <ChevronRight
                        className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')}
                      />
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}

                  <button
                    type="button"
                    onClick={() => reveal(node.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs hover:underline"
                  >
                    {isTable ? (
                      <Table2 className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                    ) : (
                      <StickyNote className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    )}
                    <span className="truncate font-medium">{node.data.name}</span>

                    {(relationshipCount.get(node.id) ?? 0) > 0 && (
                      <span className="flex flex-shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Link2 className="h-2.5 w-2.5" />
                        {relationshipCount.get(node.id)}
                      </span>
                    )}
                  </button>
                </div>

                {isOpen && columns.length > 0 && (
                  <ul className="ml-5 border-l border-border pl-2">
                    {columns.map((column) => (
                      <li
                        key={column.id}
                        className="flex items-center gap-1.5 py-0.5 text-[11px]"
                      >
                        {column.primaryKey && (
                          <KeyRound className="h-2.5 w-2.5 flex-shrink-0 text-yellow-500" />
                        )}
                        {/* Selectable, which is the point: a canvas has no copyable text. */}
                        <span className="min-w-0 flex-1 truncate">{column.name}</span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                          {column.length ? `${column.dataType}(${column.length})` : column.dataType}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <p className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
        {nodes.filter((n) => n.type === 'table').length} tables · {edges.length} relationships
      </p>
    </nav>
  );
}

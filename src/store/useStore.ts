import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  DBNode,
  DBEdge,
  Column,
  EndpointRef,
  HistoryEntry,
  Cardinality,
  DiagramState,
  ClipboardData,
  SearchFilter,
  SearchResult,
  SearchHighlight,
  TableNode,
} from '@/types';
import { METRICS, clamp, intrinsicTableHeight, nodeSizeLimits } from '@/engine/geometry';
import { gridLayout, layeredLayout } from '@/engine/layout/layered';
import { sanitizeDiagram } from '@/lib/diagramValidation';
import {
  CORRUPT_BACKUP_KEY,
  CURRENT_SCHEMA_VERSION,
  assertPersistedShape,
  runMigrations,
  type PersistedShape,
} from './migrations';

/** Which arrangement the toolbar asked for. */
export type ArrangeKind = 'layered-lr' | 'layered-tb' | 'grid';

const MAX_HISTORY = 50;

/**
 * Re-derive a table's height from its columns.
 *
 * Tables auto-size vertically: a table that could scroll internally could hide a
 * column, and a hidden column has no on-screen port for an edge to attach to.
 * Call this after anything that changes the column list or the comment.
 */
function resized(node: TableNode): TableNode {
  return { ...node, h: intrinsicTableHeight(node.data) };
}

/** True when the edge has either end attached to `columnId`. */
function touchesColumn(edge: DBEdge, columnId: string): boolean {
  return edge.source.columnId === columnId || edge.target.columnId === columnId;
}

/** The selection fields of the store, narrowed to what `pruneSelection` touches. */
interface Selection {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: Set<string>;
}

/**
 * Drop anything from the selection that no longer exists.
 *
 * Undo, redo and import all replace the document wholesale, and a selection left
 * pointing at a deleted id is a phantom: the properties panel shows nothing, and
 * a subsequent delete pushes an undo step that removes nothing.
 */
function pruneSelection(
  nodes: readonly DBNode[],
  edges: readonly DBEdge[],
  current: Selection
): Selection {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const selectedNodeIds = new Set([...current.selectedNodeIds].filter((id) => nodeIds.has(id)));

  return {
    selectedNodeIds,
    selectedNodeId:
      current.selectedNodeId && nodeIds.has(current.selectedNodeId)
        ? current.selectedNodeId
        : null,
    selectedEdgeId:
      current.selectedEdgeId && edges.some((e) => e.id === current.selectedEdgeId)
        ? current.selectedEdgeId
        : null,
  };
}

/**
 * Rewrite every table's `Column.foreignKey` from the current edge list.
 *
 * Edges are the source of truth for relationships; `foreignKey` is a derived
 * convenience so a table can draw its FK badges without walking every edge. Run
 * this after any change to edge endpoints so the two never drift.
 */
function syncForeignKeys(nodes: DBNode[], edges: DBEdge[]): DBNode[] {
  const fks = new Map<string, { tableId: string; columnId: string }>();

  for (const edge of edges) {
    if (edge.data.isNoteLink) continue;
    const from = edge.source.columnId;
    const to = edge.target.columnId;
    if (!from || !to) continue;
    fks.set(from, { tableId: edge.target.nodeId, columnId: to });
  }

  return nodes.map((node) => {
    if (node.type !== 'table') return node;

    let changed = false;
    const columns = node.data.columns.map((column) => {
      const fk = fks.get(column.id);
      const same =
        fk && column.foreignKey
          ? fk.tableId === column.foreignKey.tableId && fk.columnId === column.foreignKey.columnId
          : fk === undefined && column.foreignKey === undefined;
      if (same) return column;

      changed = true;
      if (!fk) {
        const next: Column = { ...column };
        delete next.foreignKey;
        return next;
      }
      return { ...column, foreignKey: fk };
    });

    return changed ? { ...node, data: { ...node.data, columns } } : node;
  });
}

interface StoreState {
  // Nodes and edges
  nodes: DBNode[];
  edges: DBEdge[];

  // Selection
  /** The node whose properties the side panel is editing. */
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /**
   * Every selected node, for marquee select, multi-drag and copy. Kept out of the
   * node objects themselves so selection is never persisted or pushed onto history.
   */
  selectedNodeIds: Set<string>;

  // History for undo/redo (see the `past`/`future` note on saveToHistory)
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Theme
  theme: 'light' | 'dark' | 'system';

  /**
   * Connect picker state (not persisted).
   *
   * Opened from the toolbar, the `C` shortcut, a table's context menu, and by
   * dropping a dragged connection on a table body — so it lives in the store
   * rather than in whichever component happened to trigger it. The seed prefills
   * whichever end the trigger already knows.
   */
  connect: { open: boolean; source?: EndpointRef; target?: EndpointRef };

  /**
   * Whether the outline sidebar is shown.
   *
   * Persisted, unlike the rest of the UI state: it is a lasting preference about
   * how the user wants to work, not a transient interaction.
   */
  showOutline: boolean;
  toggleOutline: () => void;

  // Search (not persisted)
  searchQuery: string;
  searchFilter: SearchFilter;
  searchResults: SearchResult[];
  searchHighlights: Map<string, SearchHighlight>;
  isSearchOpen: boolean;

  // Actions - Geometry (the canvas engine commits drags and resizes through these)
  /** Move nodes by a delta as one undoable step, called once when a drag ends. */
  moveNodes: (nodeIds: string[], delta: { x: number; y: number }) => void;
  /** Resize a node. Tables take the width only; their height stays derived. */
  resizeNode: (nodeId: string, rect: { x: number; y: number; w: number; h: number }) => void;

  /**
   * Re-position nodes with the auto-layout, as one undoable step.
   * Restricted to the current selection when `onlySelected` and more than one
   * node is selected.
   */
  arrange: (kind: ArrangeKind, onlySelected?: boolean) => void;

  // Actions - Add nodes
  addTable: (position: { x: number; y: number }) => string;
  addGroup: (position: { x: number; y: number }) => string;
  addNote: (position: { x: number; y: number }) => string;

  // Actions - Update nodes
  updateTableName: (nodeId: string, name: string) => void;
  updateTableColor: (nodeId: string, color: string) => void;
  updateTableComment: (nodeId: string, comment: string) => void;

  // Actions - Column management
  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  reorderColumns: (tableId: string, columnIds: string[]) => void;

  // Actions - Group management
  updateGroupName: (nodeId: string, name: string) => void;
  updateGroupColor: (nodeId: string, color: string) => void;

  // Actions - Note management
  updateNoteContent: (nodeId: string, content: string) => void;
  updateNoteColor: (nodeId: string, color: string) => void;
  updateNoteName: (nodeId: string, name: string) => void;

  // Actions - Edge management
  /**
   * Create a relationship without dragging. The click-to-connect picker and the
   * React Flow drag bridge both land here.
   * Returns the new edge id, or null when the pair is rejected as invalid.
   */
  createRelationship: (input: {
    source: EndpointRef;
    target: EndpointRef;
    cardinality?: Cardinality;
    label?: string;
  }) => string | null;
  setEdgeEndpoint: (edgeId: string, which: 'source' | 'target', ref: EndpointRef) => void;
  /** Pin (or clear, with an empty array) the points a route must pass through. */
  setEdgeWaypoints: (edgeId: string, waypoints: { x: number; y: number }[]) => void;
  /** Open the connect picker, optionally with one end already chosen. */
  openConnect: (seed?: { source?: EndpointRef; target?: EndpointRef }) => void;
  closeConnect: () => void;
  updateEdgeCardinality: (edgeId: string, cardinality: Cardinality) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  updateEdgeColumns: (edgeId: string, sourceColumn: string, targetColumn: string) => void;
  updateEdgeColor: (edgeId: string, color?: string) => void;
  updateEdgePattern: (edgeId: string, pattern?: string) => void;

  // Actions - Delete
  deleteNode: (nodeId: string) => void;
  /** Delete several nodes as one undoable step. */
  deleteNodes: (nodeIds: readonly string[]) => void;
  deleteEdge: (edgeId: string) => void;
  deleteSelected: () => void;

  // Actions - Selection
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setSelectedNodes: (nodeIds: string[]) => void;
  /** Select one node, or toggle it into the current selection when `additive`. */
  selectNode: (nodeId: string, additive?: boolean) => void;
  clearSelection: () => void;

  // Actions - History
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions - Theme
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Actions - File operations
  exportDiagram: () => DiagramState;
  importDiagram: (state: DiagramState) => void;
  clearDiagram: () => void;

  // Actions - Clipboard
  copySelectedNodes: () => Promise<void>;
  pasteNodes: (position: { x: number; y: number }) => Promise<string[] | undefined>;

  // Actions - Search
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
  clearSearch: () => void;
  setSearchOpen: (open: boolean) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: new Set<string>(),
      past: [],
      future: [],
      theme: 'system',

      connect: { open: false },
      showOutline: false,

      // Search state (not persisted)
      searchQuery: '',
      searchFilter: 'all' as SearchFilter,
      searchResults: [],
      searchHighlights: new Map(),
      isSearchOpen: false,

      // Geometry
      moveNodes: (nodeIds, delta) => {
        if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) return;

        const moving = new Set(nodeIds);
        get().saveToHistory();

        set({
          nodes: get().nodes.map((node) =>
            moving.has(node.id) ? { ...node, x: node.x + delta.x, y: node.y + delta.y } : node
          ),
        });
      },

      resizeNode: (nodeId, rect) => {
        get().saveToHistory();

        set({
          nodes: get().nodes.map((node) => {
            if (node.id !== nodeId) return node;

            // Same limits the live preview clamped against, so the shape never
            // jumps between what was dragged and what was committed.
            const limits = nodeSizeLimits(node);
            const w = Math.round(clamp(rect.w, limits.minW, limits.maxW));

            if (node.type === 'table') {
              // Height follows the column count, so a resize only sets the
              // width — and must leave `y` alone, or dragging a top handle
              // would translate the node instead of resizing it.
              return resized({ ...node, x: rect.x, w });
            }

            return {
              ...node,
              x: rect.x,
              y: rect.y,
              w,
              h: Math.round(Math.max(limits.minH, rect.h)),
            };
          }),
        });
      },

      arrange: (kind, onlySelected = false) => {
        const { nodes, edges, selectedNodeIds } = get();
        if (nodes.length === 0) return;

        const only = onlySelected && selectedNodeIds.size > 1 ? selectedNodeIds : undefined;

        const positions =
          kind === 'grid'
            ? gridLayout(nodes, { only })
            : layeredLayout(nodes, edges, {
                direction: kind === 'layered-tb' ? 'TB' : 'LR',
                only,
              });

        if (positions.size === 0) return;

        get().saveToHistory();
        set({
          nodes: nodes.map((node) => {
            const next = positions.get(node.id);
            return next ? { ...node, x: next.x, y: next.y } : node;
          }),
        });
      },

      // Add nodes
      addTable: (position) => {
        const id = uuidv4();
        // `resized` derives the height from the column list, so it never has to be
        // guessed here or corrected later.
        const newNode: DBNode = resized({
          id,
          type: 'table',
          x: position.x,
          y: position.y,
          w: METRICS.defaultW,
          h: 0,
          z: 1, // Above groups
          data: {
            type: 'table',
            name: 'New Table',
            columns: [
              {
                id: uuidv4(),
                name: 'id',
                dataType: 'INT',
                nullable: false,
                primaryKey: true,
                unique: true,
                autoIncrement: true,
              },
            ],
          },
        });

        get().saveToHistory();
        set({ nodes: [...get().nodes, newNode] });
        return id;
      },

      addGroup: (position) => {
        const id = uuidv4();
        const newNode: DBNode = {
          id,
          type: 'group',
          x: position.x,
          y: position.y,
          w: METRICS.groupDefaultW,
          h: METRICS.groupDefaultH,
          z: 0, // Behind other nodes
          data: {
            type: 'group',
            name: 'New Group',
          },
        };

        get().saveToHistory();
        set({ nodes: [...get().nodes, newNode] });
        return id;
      },

      addNote: (position) => {
        const id = uuidv4();
        const newNode: DBNode = {
          id,
          type: 'note',
          x: position.x,
          y: position.y,
          w: METRICS.noteDefaultW,
          h: METRICS.noteDefaultH,
          z: 2, // Above tables
          data: {
            type: 'note',
            name: 'New Note',
            content: 'New note...',
          },
        };

        get().saveToHistory();
        set({ nodes: [...get().nodes, newNode] });
        return id;
      },

      // Update table
      updateTableName: (nodeId, name) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'table'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      updateTableColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'table'
              ? { ...node, data: { ...node.data, color } }
              : node
          ) as DBNode[],
        });
      },

      updateTableComment: (nodeId, comment) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            // A comment adds a band under the header, so the height changes with it.
            node.id === nodeId && node.type === 'table'
              ? resized({ ...node, data: { ...node.data, comment } })
              : node
          ) as DBNode[],
        });
      },

      // Column management
      addColumn: (tableId) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.type === 'table') {
              const newColumn: Column = {
                id: uuidv4(),
                name: 'new_column',
                dataType: 'VARCHAR',
                length: 255,
                nullable: true,
                primaryKey: false,
                unique: false,
                autoIncrement: false,
              };
              return resized({
                ...node,
                data: {
                  ...node.data,
                  columns: [...node.data.columns, newColumn],
                },
              });
            }
            return node;
          }) as DBNode[],
        });
      },

      updateColumn: (tableId, columnId, updates) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.type === 'table') {
              return {
                ...node,
                data: {
                  ...node.data,
                  columns: node.data.columns.map((col) =>
                    col.id === columnId ? { ...col, ...updates } : col
                  ),
                },
              };
            }
            return node;
          }) as DBNode[],
        });
      },

      deleteColumn: (tableId, columnId) => {
        get().saveToHistory();

        // Any relationship anchored to this column has lost an endpoint, so it goes
        // with it. Endpoints are structured now, so this is a field check rather
        // than the old `sourceHandle === \`${columnId}-right\`` string match.
        const edges = get().edges.filter((edge) => !touchesColumn(edge, columnId));

        const nodes = get().nodes.map((node) => {
          if (node.id === tableId && node.type === 'table') {
            return resized({
              ...node,
              data: {
                ...node.data,
                columns: node.data.columns.filter((col) => col.id !== columnId),
              },
            });
          }
          return node;
        }) as DBNode[];

        set({ nodes: syncForeignKeys(nodes, edges), edges });
      },

      reorderColumns: (tableId, columnIds) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.type === 'table') {
              const columnMap = new Map(node.data.columns.map((c) => [c.id, c]));
              const reorderedColumns = columnIds
                .map((id) => columnMap.get(id))
                .filter(Boolean) as Column[];
              return {
                ...node,
                data: {
                  ...node.data,
                  columns: reorderedColumns,
                },
              };
            }
            return node;
          }) as DBNode[],
        });
      },

      // Group management
      updateGroupName: (nodeId, name) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'group'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      updateGroupColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'group'
              ? { ...node, data: { ...node.data, color } }
              : node
          ) as DBNode[],
        });
      },

      // Note management
      updateNoteContent: (nodeId, content) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'note'
              ? { ...node, data: { ...node.data, content } }
              : node
          ) as DBNode[],
        });
      },

      updateNoteColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'note'
              ? { ...node, data: { ...node.data, color } }
              : node
          ) as DBNode[],
        });
      },

      updateNoteName: (nodeId, name) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.type === 'note'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      // Edge management
      createRelationship: ({ source, target, cardinality, label }) => {
        const { nodes, edges } = get();

        const sourceNode = nodes.find((n) => n.id === source.nodeId);
        const targetNode = nodes.find((n) => n.id === target.nodeId);
        if (!sourceNode || !targetNode) return null;

        // A column cannot reference itself.
        if (
          source.nodeId === target.nodeId &&
          source.columnId !== undefined &&
          source.columnId === target.columnId
        ) {
          return null;
        }

        // Don't stack a second identical relationship on the same pair of endpoints.
        const duplicate = edges.some(
          (e) =>
            e.source.nodeId === source.nodeId &&
            e.target.nodeId === target.nodeId &&
            e.source.columnId === source.columnId &&
            e.target.columnId === target.columnId
        );
        if (duplicate) return null;

        const isNoteLink = sourceNode.type === 'note' || targetNode.type === 'note';

        const newEdge: DBEdge = {
          id: uuidv4(),
          source,
          target,
          data: {
            type: 'relationship',
            cardinality: cardinality ?? 'one-to-many',
            label,
            isNoteLink,
            pattern: isNoteLink ? 'dashed' : undefined,
          },
        };

        get().saveToHistory();
        const nextEdges = [...edges, newEdge];
        set({ edges: nextEdges, nodes: syncForeignKeys(nodes, nextEdges) });

        return newEdge.id;
      },

      setEdgeEndpoint: (edgeId, which, ref) => {
        get().saveToHistory();

        const edges = get().edges.map((edge) =>
          edge.id === edgeId ? { ...edge, [which]: ref } : edge
        );

        set({ edges, nodes: syncForeignKeys(get().nodes, edges) });
      },

      setEdgeWaypoints: (edgeId, waypoints) => {
        get().saveToHistory();

        set({
          edges: get().edges.map((edge) => {
            if (edge.id !== edgeId) return edge;

            // Drop the key entirely when empty, so an edge that was never nudged
            // and one that was reset are the same shape on disk.
            if (waypoints.length === 0) {
              const { waypoints: _cleared, ...rest } = edge;
              return rest;
            }

            return { ...edge, waypoints };
          }),
        });
      },

      openConnect: (seed) => {
        set({ connect: { open: true, source: seed?.source, target: seed?.target } });
      },

      closeConnect: () => {
        set({ connect: { open: false } });
      },

      toggleOutline: () => set({ showOutline: !get().showOutline }),

      updateEdgeCardinality: (edgeId, cardinality) => {
        get().saveToHistory();
        set({
          edges: get().edges.map((edge) =>
            edge.id === edgeId
              ? { ...edge, data: { ...edge.data, cardinality } }
              : edge
          ) as DBEdge[],
        });
      },

      updateEdgeLabel: (edgeId, label) => {
        get().saveToHistory();
        set({
          edges: get().edges.map((edge) =>
            edge.id === edgeId
              ? { ...edge, data: { ...edge.data, label } }
              : edge
          ) as DBEdge[],
        });
      },

      /**
       * Point both ends of an edge at specific columns.
       *
       * Kept as a single call because the properties panel edits both selects
       * together; it is a thin wrapper over the endpoints now that the column lives
       * on the endpoint rather than being encoded into a React Flow handle id.
       */
      updateEdgeColumns: (edgeId, sourceColumn, targetColumn) => {
        get().saveToHistory();

        const edges = get().edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                source: { ...edge.source, columnId: sourceColumn || undefined },
                target: { ...edge.target, columnId: targetColumn || undefined },
              }
            : edge
        );

        set({ edges, nodes: syncForeignKeys(get().nodes, edges) });
      },

      updateEdgeColor: (edgeId, color) => {
        get().saveToHistory();
        set({
          edges: get().edges.map((edge) =>
            edge.id === edgeId
              ? { ...edge, data: { ...edge.data, color } }
              : edge
          ) as DBEdge[],
        });
      },

      updateEdgePattern: (edgeId, pattern) => {
        get().saveToHistory();
        set({
          edges: get().edges.map((edge) =>
            edge.id === edgeId
              ? { ...edge, data: { ...edge.data, pattern } }
              : edge
          ) as DBEdge[],
        });
      },

      // Delete operations
      deleteNode: (nodeId) => get().deleteNodes([nodeId]),

      deleteNodes: (nodeIds) => {
        const doomed = new Set(nodeIds);
        if (doomed.size === 0) return;

        get().saveToHistory();

        const nodes = get().nodes.filter((node) => !doomed.has(node.id));
        const edges = get().edges.filter(
          (edge) => !doomed.has(edge.source.nodeId) && !doomed.has(edge.target.nodeId)
        );

        set({
          nodes: syncForeignKeys(nodes, edges),
          edges,
          ...pruneSelection(nodes, edges, {
            selectedNodeId: get().selectedNodeId,
            selectedEdgeId: get().selectedEdgeId,
            selectedNodeIds: get().selectedNodeIds,
          }),
        });
      },

      deleteEdge: (edgeId) => {
        get().saveToHistory();

        const edges = get().edges.filter((edge) => edge.id !== edgeId);

        set({
          edges,
          nodes: syncForeignKeys(get().nodes, edges),
          selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
        });
      },

      /**
       * Delete whatever is selected.
       *
       * `selectedNodeIds` is the authority, not `selectedNodeId`: a marquee
       * selection of more than one node leaves `selectedNodeId` null (the
       * properties panel only edits one at a time), so keying off it alone made
       * Delete a no-op for exactly the case where it matters most.
       */
      deleteSelected: () => {
        const { selectedNodeId, selectedEdgeId, selectedNodeIds } = get();

        const nodeIds =
          selectedNodeIds.size > 0
            ? [...selectedNodeIds]
            : selectedNodeId
              ? [selectedNodeId]
              : [];

        if (nodeIds.length > 0) {
          get().deleteNodes(nodeIds);
        } else if (selectedEdgeId) {
          get().deleteEdge(selectedEdgeId);
        }
      },

      // Selection
      setSelectedNode: (nodeId) => {
        set({
          selectedNodeId: nodeId,
          selectedEdgeId: null,
          selectedNodeIds: nodeId ? new Set([nodeId]) : new Set(),
        });
      },

      setSelectedEdge: (edgeId) => {
        set({ selectedEdgeId: edgeId, selectedNodeId: null, selectedNodeIds: new Set() });
      },

      setSelectedNodes: (nodeIds) => {
        set({
          selectedNodeIds: new Set(nodeIds),
          // The properties panel edits one node, so it follows a single selection
          // and blanks out for a multi-selection.
          selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
          selectedEdgeId: null,
        });
      },

      selectNode: (nodeId, additive = false) => {
        if (!additive) {
          get().setSelectedNode(nodeId);
          return;
        }

        const next = new Set(get().selectedNodeIds);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);

        get().setSelectedNodes([...next]);
      },

      clearSelection: () => {
        set({ selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: new Set() });
      },

      /**
       * History management, as a past/future pair of stacks around the live document.
       *
       * `past` holds states we can go back to, `future` states we can go forward to,
       * and the store itself holds the present. Actions call `saveToHistory()` just
       * before they mutate, which pushes the current document onto `past` and drops
       * any redo branch.
       *
       * The previous implementation kept a single `history` array plus a cursor, but
       * only ever recorded pre-mutation states — the post-mutation document was never
       * written down. `undo()` then read `history[historyIndex - 1]`, one step too far
       * back, so the first undo reverted two edits.
       */
      saveToHistory: () => {
        const { nodes, edges, past } = get();
        const present: HistoryEntry = {
          nodes: structuredClone(nodes),
          edges: structuredClone(edges),
        };

        const newPast = [...past, present];
        // Oldest entries fall off the back once we exceed the cap.
        while (newPast.length > MAX_HISTORY) newPast.shift();

        // Any redo branch is invalidated by a fresh edit.
        set({ past: newPast, future: [] });
      },

      undo: () => {
        const { nodes, edges, past, future } = get();
        if (past.length === 0) return;

        const previous = past[past.length - 1];
        const restoredNodes = structuredClone(previous.nodes);
        const restoredEdges = structuredClone(previous.edges);

        set({
          nodes: restoredNodes,
          edges: restoredEdges,
          past: past.slice(0, -1),
          future: [...future, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
          ...pruneSelection(restoredNodes, restoredEdges, get()),
        });
      },

      redo: () => {
        const { nodes, edges, past, future } = get();
        if (future.length === 0) return;

        const next = future[future.length - 1];
        const restoredNodes = structuredClone(next.nodes);
        const restoredEdges = structuredClone(next.edges);

        set({
          nodes: restoredNodes,
          edges: restoredEdges,
          past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
          future: future.slice(0, -1),
          ...pruneSelection(restoredNodes, restoredEdges, get()),
        });
      },

      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,

      // Theme
      setTheme: (theme) => {
        set({ theme });
      },

      // File operations
      exportDiagram: () => ({
        nodes: get().nodes,
        edges: get().edges,
      }),

      importDiagram: (state) => {
        get().saveToHistory();
        set({
          nodes: state.nodes,
          edges: state.edges,
          // The incoming document knows nothing about what was selected in the
          // old one, and every id in it is new.
          selectedNodeId: null,
          selectedEdgeId: null,
          selectedNodeIds: new Set(),
        });
      },

      clearDiagram: () => {
        get().saveToHistory();
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedEdgeId: null,
          selectedNodeIds: new Set(),
        });
      },

      // Clipboard operations
      copySelectedNodes: async () => {
        const { nodes, selectedNodeIds } = get();
        const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));

        if (selectedNodes.length === 0) return;

        const clipboardData: ClipboardData = {
          type: 'db-mapper-nodes',
          version: '1.0',
          nodes: structuredClone(selectedNodes),
        };

        try {
          await navigator.clipboard.writeText(JSON.stringify(clipboardData));
        } catch (err) {
          console.error('Failed to copy to clipboard:', err);
        }
      },

      pasteNodes: async (position) => {
        try {
          const text = await navigator.clipboard.readText();
          const data = JSON.parse(text);

          // Validate clipboard data format
          if (data.type !== 'db-mapper-nodes' || !Array.isArray(data.nodes)) {
            return;
          }

          const clipboardData = data as ClipboardData;

          if (clipboardData.nodes.length === 0) return;

          // Calculate the bounding box of copied nodes to determine offset
          const minX = Math.min(...clipboardData.nodes.map((n) => n.x));
          const minY = Math.min(...clipboardData.nodes.map((n) => n.y));

          // Map old IDs to new IDs for reference
          const idMap = new Map<string, string>();

          const newNodes: DBNode[] = clipboardData.nodes.map((node) => {
            const newId = uuidv4();
            idMap.set(node.id, newId);

            // Preserve the relative layout of a multi-node copy.
            const baseNode = {
              ...node,
              id: newId,
              x: position.x + (node.x - minX),
              y: position.y + (node.y - minY),
            };

            // Handle different node types
            if (node.type === 'table') {
              return {
                ...baseNode,
                data: {
                  ...node.data,
                  name: `${node.data.name} (copy)`,
                  columns: node.data.columns.map((col: Column) => ({
                    ...col,
                    id: uuidv4(),
                    // Clear foreign keys as they reference old table IDs
                    foreignKey: undefined,
                  })),
                },
              } as DBNode;
            } else if (node.type === 'group') {
              return {
                ...baseNode,
                data: {
                  ...node.data,
                  name: `${node.data.name} (copy)`,
                },
              } as DBNode;
            } else if (node.type === 'note') {
              return {
                ...baseNode,
                data: {
                  ...node.data,
                  name: `${node.data.name} (copy)`,
                },
              } as DBNode;
            }

            return baseNode as DBNode;
          });

          get().saveToHistory();
          set({ nodes: [...get().nodes, ...newNodes] });

          return newNodes.map((n) => n.id);
        } catch (err) {
          // Silent fail for invalid clipboard data
          console.error('Failed to paste from clipboard:', err);
        }
      },

      // Search actions
      setSearchQuery: (query: string) => {
        const { nodes, searchFilter } = get();
        const trimmedQuery = query.trim().toLowerCase();

        if (!trimmedQuery) {
          set({
            searchQuery: query,
            searchResults: [],
            searchHighlights: new Map(),
          });
          return;
        }

        const results: SearchResult[] = [];
        const highlights = new Map<string, SearchHighlight>();

        // Search through table nodes
        nodes.forEach((node) => {
          if (node.data.type !== 'table') return;

          const tableNameMatch = node.data.name.toLowerCase().includes(trimmedQuery);
          const matchingColumnIds: string[] = [];

          // Check column matches
          node.data.columns.forEach((column) => {
            if (column.name.toLowerCase().includes(trimmedQuery)) {
              matchingColumnIds.push(column.id);

              // Add column result if filter allows
              if (searchFilter === 'all' || searchFilter === 'columns') {
                results.push({
                  nodeId: node.id,
                  tableName: node.data.name,
                  matchType: 'column',
                  columnName: column.name,
                  columnId: column.id,
                });
              }
            }
          });

          // Add table name result if filter allows
          if (tableNameMatch && (searchFilter === 'all' || searchFilter === 'tables')) {
            results.push({
              nodeId: node.id,
              tableName: node.data.name,
              matchType: 'table',
            });
          }

          // Store highlight info if there are any matches
          if (tableNameMatch || matchingColumnIds.length > 0) {
            highlights.set(node.id, {
              tableNameMatch: tableNameMatch && (searchFilter === 'all' || searchFilter === 'tables'),
              matchingColumnIds: (searchFilter === 'all' || searchFilter === 'columns') ? matchingColumnIds : [],
            });
          }
        });

        set({
          searchQuery: query,
          searchResults: results,
          searchHighlights: highlights,
        });
      },

      setSearchFilter: (filter: SearchFilter) => {
        set({ searchFilter: filter });
        // Re-run search with new filter
        const { searchQuery } = get();
        if (searchQuery.trim()) {
          get().setSearchQuery(searchQuery);
        }
      },

      clearSearch: () => {
        set({
          searchQuery: '',
          searchFilter: 'all',
          searchResults: [],
          searchHighlights: new Map(),
          isSearchOpen: false,
        });
      },

      setSearchOpen: (open: boolean) => {
        set({ isSearchOpen: open });
      },
    }),
    {
      name: 'db-mapper-storage',
      version: CURRENT_SCHEMA_VERSION,
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        theme: state.theme,
        showOutline: state.showOutline,
      }),
      /**
       * Bring persisted data up to the current schema.
       *
       * The actual upgrades live in `./migrations` as pure functions so they can be
       * unit-tested against real localStorage fixtures. All this wrapper adds is the
       * failure path: if a migration throws, we stash the raw blob under
       * CORRUPT_BACKUP_KEY and start empty rather than leaving the app wedged on
       * un-loadable state. The user can recover the backup from the Toolbar.
       */
      /**
       * Structural check on every rehydration.
       *
       * This lives in `merge` rather than `migrate` because Zustand skips
       * `migrate` entirely when the stored version already matches — which is
       * the ordinary case, and exactly where saved state used to reach the store
       * unchecked while an equivalent `.json` would have been rejected.
       */
      merge: (persisted, current) => {
        const incoming = persisted as Partial<PersistedShape> | undefined;
        if (!incoming || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
          return { ...current, ...incoming };
        }

        const sanitized = sanitizeDiagram(incoming.nodes, incoming.edges);

        if (sanitized.warnings.length > 0) {
          // Never silent: report it, and keep the original recoverable.
          console.warn('[db-mapper] Repaired the saved diagram on load:', sanitized.warnings);
          try {
            localStorage.setItem(CORRUPT_BACKUP_KEY, JSON.stringify(persisted));
          } catch {
            // Best-effort; a quota error must not block loading what is sound.
          }
        }

        return { ...current, ...incoming, nodes: sanitized.nodes, edges: sanitized.edges };
      },

      migrate: (persistedState: unknown, version: number): PersistedShape => {
        /** Keep the raw blob so nothing we reject is unrecoverable. */
        const backup = () => {
          try {
            localStorage.setItem(CORRUPT_BACKUP_KEY, JSON.stringify(persistedState));
          } catch {
            // Best-effort: a quota error here must not mask the real problem.
          }
        };

        try {
          return runMigrations(assertPersistedShape(persistedState), version);
        } catch (error) {
          console.error('[db-mapper] Failed to migrate saved diagram:', error);
          backup();
          return { nodes: [], edges: [], theme: 'system' };
        }
      },
    }
  )
);

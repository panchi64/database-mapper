import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Connection,
  EdgeChange,
  NodeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import {
  DBNode,
  DBEdge,
  Column,
  HistoryEntry,
  Cardinality,
  DiagramState,
  ClipboardData,
} from '@/types';

const MAX_HISTORY = 50;

interface StoreState {
  // Nodes and edges
  nodes: DBNode[];
  edges: DBEdge[];

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Actions - Node management
  onNodesChange: (changes: NodeChange<DBNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<DBEdge>[]) => void;
  onConnect: (connection: Connection) => void;

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
  updateEdgeCardinality: (edgeId: string, cardinality: Cardinality) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  updateEdgeColumns: (edgeId: string, sourceColumn: string, targetColumn: string) => void;
  updateEdgeColor: (edgeId: string, color?: string) => void;
  updateEdgePattern: (edgeId: string, pattern?: string) => void;

  // Actions - Delete
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  deleteSelected: () => void;

  // Actions - Selection
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
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
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [],
      historyIndex: -1,
      theme: 'system',

      // React Flow change handlers
      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes) as DBNode[],
        });
      },

      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges) as DBEdge[],
        });
      },

      onConnect: (connection) => {
        // Determine if connection involves a note node
        const nodes = get().nodes;
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        const isNoteLink = sourceNode?.data.type === 'note' || targetNode?.data.type === 'note';

        const newEdge: DBEdge = {
          ...connection,
          id: uuidv4(),
          type: 'relationship',
          data: {
            type: 'relationship',
            cardinality: 'one-to-many',
            isNoteLink,
            // Default pattern for note links
            pattern: isNoteLink ? 'dashed' : undefined,
          },
        } as DBEdge;

        get().saveToHistory();
        set({
          edges: addEdge(newEdge, get().edges) as DBEdge[],
        });
      },

      // Add nodes
      addTable: (position) => {
        const id = uuidv4();
        const newNode: DBNode = {
          id,
          type: 'table',
          position,
          zIndex: 1,  // Above groups
          style: { width: 250, height: 200 },
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
        };

        get().saveToHistory();
        set({ nodes: [...get().nodes, newNode] });
        return id;
      },

      addGroup: (position) => {
        const id = uuidv4();
        const newNode: DBNode = {
          id,
          type: 'group',
          position,
          zIndex: 0,  // Behind other nodes
          style: { width: 400, height: 300 },
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
          position,
          zIndex: 1,  // Above groups
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
            node.id === nodeId && node.data.type === 'table'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      updateTableColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'table'
              ? { ...node, data: { ...node.data, color } }
              : node
          ) as DBNode[],
        });
      },

      updateTableComment: (nodeId, comment) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'table'
              ? { ...node, data: { ...node.data, comment } }
              : node
          ) as DBNode[],
        });
      },

      // Column management
      addColumn: (tableId) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.data.type === 'table') {
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
              return {
                ...node,
                data: {
                  ...node.data,
                  columns: [...node.data.columns, newColumn],
                },
              };
            }
            return node;
          }) as DBNode[],
        });
      },

      updateColumn: (tableId, columnId, updates) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.data.type === 'table') {
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
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.data.type === 'table') {
              return {
                ...node,
                data: {
                  ...node.data,
                  columns: node.data.columns.filter((col) => col.id !== columnId),
                },
              };
            }
            return node;
          }) as DBNode[],
          // Clean up edges that reference this column's handles
          edges: get().edges.filter(edge =>
            edge.sourceHandle !== `${columnId}-right` &&
            edge.targetHandle !== `${columnId}-left`
          ),
        });
      },

      reorderColumns: (tableId, columnIds) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === tableId && node.data.type === 'table') {
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
            node.id === nodeId && node.data.type === 'group'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      updateGroupColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'group'
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
            node.id === nodeId && node.data.type === 'note'
              ? { ...node, data: { ...node.data, content } }
              : node
          ) as DBNode[],
        });
      },

      updateNoteColor: (nodeId, color) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'note'
              ? { ...node, data: { ...node.data, color } }
              : node
          ) as DBNode[],
        });
      },

      updateNoteName: (nodeId, name) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'note'
              ? { ...node, data: { ...node.data, name } }
              : node
          ) as DBNode[],
        });
      },

      // Edge management
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

      updateEdgeColumns: (edgeId, sourceColumn, targetColumn) => {
        get().saveToHistory();
        set({
          edges: get().edges.map((edge) =>
            edge.id === edgeId
              ? {
                  ...edge,
                  // Update visual connection points to selected columns
                  sourceHandle: sourceColumn ? `${sourceColumn}-right` : edge.sourceHandle,
                  targetHandle: targetColumn ? `${targetColumn}-left` : edge.targetHandle,
                  data: { ...edge.data, sourceColumn, targetColumn }
                }
              : edge
          ) as DBEdge[],
        });
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
      deleteNode: (nodeId) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.filter((node) => node.id !== nodeId),
          edges: get().edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
          selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
        });
      },

      deleteEdge: (edgeId) => {
        get().saveToHistory();
        set({
          edges: get().edges.filter((edge) => edge.id !== edgeId),
          selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
        });
      },

      deleteSelected: () => {
        const { selectedNodeId, selectedEdgeId } = get();
        if (selectedNodeId) {
          get().deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          get().deleteEdge(selectedEdgeId);
        }
      },

      // Selection
      setSelectedNode: (nodeId) => {
        set({ selectedNodeId: nodeId, selectedEdgeId: null });
      },

      setSelectedEdge: (edgeId) => {
        set({ selectedEdgeId: edgeId, selectedNodeId: null });
      },

      clearSelection: () => {
        set({ selectedNodeId: null, selectedEdgeId: null });
      },

      // History management
      saveToHistory: () => {
        const { nodes, edges, history, historyIndex } = get();
        const newEntry: HistoryEntry = {
          nodes: structuredClone(nodes),
          edges: structuredClone(edges),
        };

        // Remove any future history if we're not at the end
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newEntry);

        // Limit history size
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }

        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const prevState = history[historyIndex - 1];
          set({
            nodes: structuredClone(prevState.nodes),
            edges: structuredClone(prevState.edges),
            historyIndex: historyIndex - 1,
          });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const nextState = history[historyIndex + 1];
          set({
            nodes: structuredClone(nextState.nodes),
            edges: structuredClone(nextState.edges),
            historyIndex: historyIndex + 1,
          });
        }
      },

      canUndo: () => get().historyIndex > 0,
      canRedo: () => get().historyIndex < get().history.length - 1,

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
        });
      },

      clearDiagram: () => {
        get().saveToHistory();
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedEdgeId: null,
        });
      },

      // Clipboard operations
      copySelectedNodes: async () => {
        const { nodes } = get();
        // Get all selected nodes (React Flow manages selection via node.selected)
        const selectedNodes = nodes.filter((node) => node.selected);

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
          const minX = Math.min(...clipboardData.nodes.map((n) => n.position.x));
          const minY = Math.min(...clipboardData.nodes.map((n) => n.position.y));

          // Map old IDs to new IDs for reference
          const idMap = new Map<string, string>();

          const newNodes: DBNode[] = clipboardData.nodes.map((node) => {
            const newId = uuidv4();
            idMap.set(node.id, newId);

            // Calculate position relative to first node, centered at paste position
            const offsetX = node.position.x - minX;
            const offsetY = node.position.y - minY;

            const baseNode = {
              ...node,
              id: newId,
              position: {
                x: position.x + offsetX,
                y: position.y + offsetY,
              },
              selected: false,
            };

            // Handle different node types
            if (node.data.type === 'table') {
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
            } else if (node.data.type === 'group') {
              return {
                ...baseNode,
                data: {
                  ...node.data,
                  name: `${node.data.name} (copy)`,
                },
              } as DBNode;
            } else if (node.data.type === 'note') {
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
    }),
    {
      name: 'db-mapper-storage',
      version: 2, // Schema version for data migration tracking
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        theme: state.theme,
      }),
      /**
       * Migration function for upgrading persisted data between schema versions.
       *
       * This runs automatically when Zustand detects the stored version differs from
       * the current version. Each migration case handles upgrading from one version
       * to the next, allowing multiple migrations to chain for older saved data.
       *
       * Version History:
       * - v0 (implicit): Original schema without version tracking
       * - v1: Added isNoteLink field to RelationshipEdgeData
       * - v2: Added color and pattern fields to RelationshipEdgeData
       *
       * Why migration is needed:
       * v0→v1: The isNoteLink field was added to prevent race conditions in edge rendering.
       * Previously, the RelationshipEdge component looked up nodes from the store on
       * every render to determine if it connected to a note node. This caused edges to
       * randomly disappear when nodes updated during drag/selection operations.
       *
       * Now, isNoteLink is computed once when the edge is created and stored in edge data.
       * This migration ensures old saved diagrams get this field added automatically.
       *
       * v1→v2: Edge customization features (color and pattern) were added. This migration
       * sets default pattern='dashed' for edges where isNoteLink=true to maintain visual
       * consistency with the previous behavior.
       *
       * @param persistedState - The saved state from localStorage
       * @param version - The version number of the saved state (0 if no version tracked)
       * @returns The migrated state with current schema
       */
      migrate: (persistedState: any, version: number) => {
        // Migration from v0 (no version) to v1 (add isNoteLink to edges)
        if (version === 0) {
          const state = persistedState as {
            nodes: DBNode[];
            edges: DBEdge[];
            theme: 'light' | 'dark' | 'system';
          };

          /**
           * For each edge missing the isNoteLink field, compute its value by checking
           * if the source or target node is a note. This replicates the old runtime
           * lookup behavior but does it once during migration instead of on every render.
           */
          const migratedEdges = state.edges.map((edge: DBEdge) => {
            // Skip edges that already have the field (shouldn't happen in v0, but defensive)
            if (edge.data?.isNoteLink !== undefined) {
              return edge;
            }

            // Look up the source and target nodes to determine if this is a note link
            const sourceNode = state.nodes.find(n => n.id === edge.source);
            const targetNode = state.nodes.find(n => n.id === edge.target);
            const isNoteLink = sourceNode?.data.type === 'note' || targetNode?.data.type === 'note';

            // Return edge with isNoteLink field added to data
            return {
              ...edge,
              data: {
                ...edge.data,
                isNoteLink,
              },
            } as DBEdge;
          });

          // Return the migrated state
          return {
            ...state,
            edges: migratedEdges,
          };
        }

        // Migration from v1 to v2 (add pattern field to note link edges)
        if (version === 1) {
          const state = persistedState as {
            nodes: DBNode[];
            edges: DBEdge[];
            theme: 'light' | 'dark' | 'system';
          };

          /**
           * Set pattern='dashed' for edges where isNoteLink=true to maintain
           * the visual appearance from v1. This ensures existing diagrams look
           * the same after upgrading to v2.
           */
          const migratedEdges = state.edges.map((edge: DBEdge) => {
            // Skip edges that already have a pattern set
            if (edge.data?.pattern !== undefined) {
              return edge;
            }

            // Set default pattern for note links
            if (edge.data?.isNoteLink === true) {
              return {
                ...edge,
                data: {
                  ...edge.data,
                  pattern: 'dashed' as const,
                },
              } as DBEdge;
            }

            // Return edge unchanged (table relationships default to solid)
            return edge;
          });

          // Return the migrated state
          return {
            ...state,
            edges: migratedEdges,
          };
        }

        // Future migrations can be added here:
        // if (version === 2) { /* migrate v2 to v3 */ }

        // No migration needed - return state as-is
        return persistedState;
      },
    }
  )
);

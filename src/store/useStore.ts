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
  toggleGroupCollapse: (nodeId: string) => void;

  // Actions - Note management
  updateNoteContent: (nodeId: string, content: string) => void;
  updateNoteColor: (nodeId: string, color: string) => void;

  // Actions - Edge management
  updateEdgeCardinality: (edgeId: string, cardinality: Cardinality) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  updateEdgeColumns: (edgeId: string, sourceColumn: string, targetColumn: string) => void;

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
        const newEdge: DBEdge = {
          ...connection,
          id: uuidv4(),
          type: 'relationship',
          data: {
            type: 'relationship',
            cardinality: 'one-to-many',
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
          style: { width: 400, height: 300 },
          data: {
            type: 'group',
            name: 'New Group',
            collapsed: false,
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
          data: {
            type: 'note',
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

      toggleGroupCollapse: (nodeId) => {
        get().saveToHistory();
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId && node.data.type === 'group'
              ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } }
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
              ? { ...edge, data: { ...edge.data, sourceColumn, targetColumn } }
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
    }),
    {
      name: 'db-mapper-storage',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        theme: state.theme,
      }),
    }
  )
);

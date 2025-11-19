import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { nodeTypes } from '@/components/nodes';
import { edgeTypes } from '@/components/edges';
import { Toolbar } from '@/components/Toolbar';
import { PropertiesPanel } from '@/components/panels';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CoordinatesDisplay } from '@/components/CoordinatesDisplay';
import { useFileOperations } from '@/hooks/useFileOperations';

function Flow() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNode,
    setSelectedEdge,
    clearSelection,
    deleteSelected,
    undo,
    redo,
    copySelectedNodes,
    pasteNodes,
  } = useStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      onConnect: state.onConnect,
      setSelectedNode: state.setSelectedNode,
      setSelectedEdge: state.setSelectedEdge,
      clearSelection: state.clearSelection,
      deleteSelected: state.deleteSelected,
      undo: state.undo,
      redo: state.redo,
      copySelectedNodes: state.copySelectedNodes,
      pasteNodes: state.pasteNodes,
    }))
  );

  // Get React Flow instance for viewport operations
  const { getViewport } = useReactFlow();

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  // Handle edge selection
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: any) => {
    setSelectedEdge(edge.id);
  }, [setSelectedEdge]);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Helper to get viewport center position
  const getViewportCenter = useCallback(() => {
    const viewport = getViewport();
    // Calculate center of the visible viewport
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    return { x: centerX, y: centerY };
  }, [getViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete/Backspace - delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
        e.preventDefault();
        deleteSelected();
      }

      // Ctrl+Z - undo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y - redo
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
          (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        redo();
      }

      // Ctrl+C - copy selected nodes
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !isInputFocused()) {
        e.preventDefault();
        copySelectedNodes();
      }

      // Ctrl+V - paste nodes
      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !isInputFocused()) {
        e.preventDefault();
        const position = getViewportCenter();
        pasteNodes(position);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, undo, redo, copySelectedNodes, pasteNodes, getViewportCenter]);

  // Memoize static options to prevent unnecessary re-renders
  const defaultEdgeOptions = useMemo(() => ({
    type: 'relationship',
    data: { type: 'relationship', cardinality: 'one-to-many' },
  }), []);

  const snapGrid = useMemo(() => [15, 15] as [number, number], []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      snapToGrid
      snapGrid={snapGrid}
      className="bg-background"
    >
      <Background gap={15} size={1} />
      <Controls />
      <MiniMap
        nodeStrokeWidth={3}
        zoomable
        pannable
        className="!bg-card border border-border rounded-md shadow-md"
      />
      <CoordinatesDisplay />
    </ReactFlow>
  );
}

// Helper to check if input is focused
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement?.getAttribute('contenteditable') === 'true'
  );
}

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const { handleFileDrop } = useFileOperations();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set dragging to false if we're leaving the container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileDrop(file);
    }
  }, [handleFileDrop]);

  return (
    <ThemeProvider>
      <ReactFlowProvider>
        <div
          className="h-screen w-screen flex flex-col"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Toolbar />
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 relative">
              <Flow />
            </div>
            <PropertiesPanel />
          </div>
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none z-50 flex items-center justify-center">
              <div className="bg-card px-6 py-4 rounded-lg shadow-lg border border-border">
                <p className="text-lg font-medium text-foreground">Drop JSON file to load diagram</p>
              </div>
            </div>
          )}
        </div>
      </ReactFlowProvider>
    </ThemeProvider>
  );
}

export default App;

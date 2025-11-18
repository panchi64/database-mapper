import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
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
    }))
  );

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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, undo, redo]);

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
  return (
    <ThemeProvider>
      <ReactFlowProvider>
        <div className="h-screen w-screen flex flex-col">
          <Toolbar />
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 relative">
              <Flow />
            </div>
            <PropertiesPanel />
          </div>
        </div>
      </ReactFlowProvider>
    </ThemeProvider>
  );
}

export default App;

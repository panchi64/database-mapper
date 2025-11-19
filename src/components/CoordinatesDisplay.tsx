import { useViewport } from '@xyflow/react';

export function CoordinatesDisplay() {
  // useViewport triggers re-render on viewport changes
  const viewport = useViewport();

  // Get the actual React Flow canvas dimensions
  const reactFlowContainer = document.querySelector('.react-flow') as HTMLElement;
  const canvasWidth = reactFlowContainer?.offsetWidth ?? window.innerWidth;
  const canvasHeight = reactFlowContainer?.offsetHeight ?? window.innerHeight;

  // Calculate the center of the canvas in flow coordinates
  const centerX = (-viewport.x + canvasWidth / 2) / viewport.zoom;
  const centerY = (-viewport.y + canvasHeight / 2) / viewport.zoom;

  return (
    <div className="absolute top-2 right-2 px-2 py-1 bg-card/90 border border-border rounded text-xs text-muted-foreground font-mono backdrop-blur-sm shadow-sm">
      X: {Math.round(centerX)}, Y: {Math.round(centerY)}
    </div>
  );
}

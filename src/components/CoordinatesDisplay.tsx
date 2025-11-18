import { useViewport } from '@xyflow/react';

export function CoordinatesDisplay() {
  // useViewport triggers re-render on viewport changes
  const viewport = useViewport();

  // Calculate the center of the canvas in flow coordinates
  // We need to get the center of the visible area
  const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
  const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;

  return (
    <div className="absolute top-2 right-2 px-2 py-1 bg-card/90 border border-border rounded text-xs text-muted-foreground font-mono backdrop-blur-sm shadow-sm">
      X: {Math.round(centerX)}, Y: {Math.round(centerY)}
    </div>
  );
}

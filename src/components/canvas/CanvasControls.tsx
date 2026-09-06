/**
 * Zoom and fit controls, plus the coordinate readout.
 *
 * Replaces React Flow's `<Controls>` and the old `CoordinatesDisplay`. Both read
 * the viewport, so they share one subscription rather than two.
 */
import { Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MAX_ZOOM, MIN_ZOOM, zoomAt, type ViewportController } from '@/engine/viewport';
import { useViewportValue } from './canvasApi';

interface Props {
  viewport: ViewportController;
  onFit: () => void;
  canvasSize: () => { width: number; height: number };
}

export function CanvasControls({ viewport, onFit, canvasSize }: Props) {
  const vp = useViewportValue(viewport);

  // Zoom about the middle of the canvas, so the buttons behave like the wheel
  // does over the centre of the view.
  const zoomBy = (factor: number) => {
    const size = canvasSize();
    viewport.set(zoomAt(viewport.get(), { x: size.width / 2, y: size.height / 2 }, factor), {
      animate: true,
      duration: 140,
    });
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-md">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Zoom out"
              disabled={vp.zoom <= MIN_ZOOM}
              onClick={() => zoomBy(1 / 1.25)}
            >
              <Minus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <button
          type="button"
          onClick={() => viewport.set({ ...viewport.get(), zoom: 1 }, { animate: true })}
          className="min-w-[3.5rem] rounded px-1 py-1 text-xs font-medium tabular-nums text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Reset zoom to 100%"
        >
          {Math.round(vp.zoom * 100)}%
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Zoom in"
              disabled={vp.zoom >= MAX_ZOOM}
              onClick={() => zoomBy(1.25)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Fit diagram to view" onClick={onFit}>
              <Maximize className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to view</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <span className="px-2 text-xs tabular-nums text-muted-foreground">
          {Math.round(-vp.x / vp.zoom)}, {Math.round(-vp.y / vp.zoom)}
        </span>
      </div>
    </TooltipProvider>
  );
}

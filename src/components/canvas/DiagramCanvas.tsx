/**
 * The canvas surface: the diagram, its controls, its minimap, and the two pieces
 * of DOM that have to float on top of it.
 *
 * `useCanvasEngine` owns the render loop and the long-lived engine objects. This
 * component owns only what React genuinely needs to render — the context menu and
 * the inline text editor — and never re-renders per frame.
 */
import { useEffect, useRef, useState } from 'react';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { readPalette, type Palette } from '@/engine/theme';
import type { Hit } from '@/engine/hitTest';
import type { Point } from '@/engine/geometry';
import { CanvasContextMenu } from './CanvasContextMenu';
import { CanvasControls } from './CanvasControls';
import { CanvasMinimap } from './CanvasMinimap';
import { NotationLegend } from './NotationLegend';
import { InlineEditor, type InlineEdit } from './InlineEditor';
import { useCanvasEngine } from './useCanvasEngine';
import { useProvideCanvasApi } from './canvasApi';

export function DiagramCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [menu, setMenu] = useState<{ hit: Hit | null; at: Point } | null>(null);
  const [editing, setEditing] = useState<InlineEdit | null>(null);

  const resolvedTheme = useResolvedTheme();
  const [palette, setPalette] = useState<Palette>(() => readPalette());

  // The canvas cannot resolve `hsl(var(--border))`, so re-read the CSS variables
  // into concrete colours whenever the theme flips.
  useEffect(() => {
    setPalette(readPalette());
  }, [resolvedTheme]);

  const engine = useCanvasEngine({ canvasRef, containerRef, palette, setEditing, setMenu });

  // Publish the camera so the toolbar and global search can drive it, the way
  // they used to call `useReactFlow().setCenter`.
  useProvideCanvasApi(engine);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <CanvasContextMenu
        menu={menu}
        onOpenChange={(open) => !open && setMenu(null)}
        onStartEdit={setEditing}
      >
        <canvas
          ref={canvasRef}
          // The engine consumes all pointer input itself; `touch-action: none`
          // stops the browser claiming drags for scrolling first.
          className="block h-full w-full touch-none outline-none"
          style={{ touchAction: 'none' }}
          tabIndex={0}
          role="application"
          aria-label="Database diagram canvas"
        />
      </CanvasContextMenu>

      <CanvasControls
        viewport={engine.viewport}
        onFit={engine.fitToDiagram}
        canvasSize={engine.getSize}
      />
      <NotationLegend palette={palette} />
      <CanvasMinimap viewport={engine.viewport} palette={palette} canvasSize={engine.getSize} />

      {editing && (
        <InlineEditor edit={editing} viewport={engine.viewport} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

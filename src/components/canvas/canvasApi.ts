/**
 * Imperative access to the canvas camera, for components outside it.
 *
 * Global search pans to a result and the toolbar drops new nodes in the middle of
 * the view. Both used to call `useReactFlow()`; this is the replacement.
 *
 * The context holds a *ref* rather than the API itself on purpose. The API is
 * created inside the canvas after it mounts, and every consumer calls it from an
 * event handler — so nobody needs to re-render when it appears, and putting it in
 * state would re-render the whole tree for nothing.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Point } from '@/engine/geometry';
import type { Viewport, ViewportController } from '@/engine/viewport';

/**
 * The camera surface exposed to components outside the canvas.
 *
 * Purely imperative — every method is called from an event handler. Anything that
 * needs the viewport *continuously* (the zoom readout, the minimap) lives inside
 * the canvas and subscribes to the controller directly, via `useViewportValue`.
 */
export interface CanvasApi {
  /** Pan and zoom so one node fills a comfortable portion of the view. */
  centerOnNode: (nodeId: string, zoom?: number) => void;
  /** World coordinate at the middle of the viewport — where new nodes land. */
  viewportCenterWorld: () => Point;
}

type ApiRef = { current: CanvasApi | null };

export const CanvasApiContext = createContext<ApiRef>({ current: null });

/** Called by the canvas to publish its API. */
export function useProvideCanvasApi(api: CanvasApi): void {
  const ref = useContext(CanvasApiContext);

  useEffect(() => {
    ref.current = api;
    return () => {
      if (ref.current === api) ref.current = null;
    };
  }, [api, ref]);
}

/**
 * Camera controls, safe to call before the canvas has mounted (they no-op).
 * Returns a stable object, so it is fine in a dependency array.
 */
export function useCanvasApi(): CanvasApi {
  const ref = useContext(CanvasApiContext);

  return useMemo<CanvasApi>(
    () => ({
      centerOnNode: (nodeId, zoom) => ref.current?.centerOnNode(nodeId, zoom),
      viewportCenterWorld: () => ref.current?.viewportCenterWorld() ?? { x: 0, y: 0 },
    }),
    [ref]
  );
}

/**
 * Track a viewport controller as React state.
 *
 * Only the coordinate readout and the minimap use this: panning updates the
 * viewport ~60 times a second, so re-rendering on it is opt-in, never implicit.
 */
export function useViewportValue(controller: ViewportController): Viewport {
  const [vp, setVp] = useState<Viewport>(() => controller.get());

  useEffect(() => {
    setVp(controller.get());
    return controller.subscribe(setVp);
  }, [controller]);

  return vp;
}

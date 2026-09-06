/**
 * Provides the canvas API ref to the tree.
 *
 * Its own file so it exports nothing but a component, which is what React Fast
 * Refresh needs to hot-reload it. The context object and the hooks that read it
 * live in `canvasApi.ts`.
 */
import { useRef } from 'react';
import { CanvasApiContext, type CanvasApi } from './canvasApi';

export function CanvasApiProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<CanvasApi | null>(null);
  // The ref object is stable, so this provider never re-renders its consumers.
  return <CanvasApiContext.Provider value={ref}>{children}</CanvasApiContext.Provider>;
}

// @vitest-environment jsdom
/**
 * End-to-end smoke test: seed localStorage with a diagram saved by the *old*
 * React Flow build, mount the whole app, and check it comes up intact.
 *
 * The one test that exercises migration -> store -> canvas mount as a single
 * path, which is exactly where a schema refactor breaks things without any unit
 * test noticing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { intrinsicTableHeight } from '@/engine/geometry';
import { useStore } from '@/store';
import type { TableNode } from '@/types';
import { installCanvasStub } from '@/test/canvasStub';
import App from './App';

// The canvas engine measures its container and paints; jsdom provides neither.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let uninstallCanvas: (() => void) | null = null;

beforeEach(() => {
  uninstallCanvas = installCanvasStub();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1 });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  uninstallCanvas?.();
  uninstallCanvas = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Exactly the shape the pre-refactor build wrote: v0, `position`, handle strings. */
function seedLegacyDiagram() {
  localStorage.setItem(
    'db-mapper-storage',
    JSON.stringify({
      version: 0,
      state: {
        theme: 'light',
        nodes: [
          {
            id: 'orders',
            type: 'table',
            position: { x: 0, y: 0 },
            style: { width: 250, height: 200 },
            selected: true,
            measured: { width: 250, height: 200 },
            data: {
              type: 'table',
              name: 'orders',
              columns: [
                { id: 'o-user', name: 'user_id', dataType: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
              ],
            },
          },
          {
            id: 'users',
            type: 'table',
            position: { x: 400, y: 0 },
            style: { width: 250, height: 200 },
            data: {
              type: 'table',
              name: 'users',
              columns: [
                { id: 'u-id', name: 'id', dataType: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true },
              ],
            },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'orders',
            target: 'users',
            sourceHandle: 'o-user-right',
            targetHandle: 'u-id-left',
            type: 'relationship',
            data: { type: 'relationship', cardinality: 'one-to-many' },
          },
        ],
      },
    })
  );
}

describe('app smoke test', () => {
  it('mounts with an empty diagram', () => {
    render(<App />);
    expect(document.querySelector('canvas[role="application"]')).toBeTruthy();
  });

  it('loads and migrates a diagram saved by the old React Flow build', async () => {
    seedLegacyDiagram();
    // The store rehydrates when its module is first imported, which already
    // happened above — so replay it now that localStorage holds the old diagram.
    await useStore.persist.rehydrate();

    render(<App />);

    // The canvas paints to a stubbed 2D context here, so assert on the state the
    // app came up with rather than on pixels. Scene contents are covered
    // separately, against the recorder, in the engine tests.
    await waitFor(() => expect(useStore.getState().nodes).toHaveLength(2));

    const state = useStore.getState();
    expect(state.nodes.map((n) => n.id).sort()).toEqual(['orders', 'users']);

    // Geometry was flattened out of `position`/`style`.
    const orders = state.nodes.find((n) => n.id === 'orders') as TableNode;
    expect(orders).toMatchObject({ x: 0, y: 0, type: 'table' });
    expect(orders).not.toHaveProperty('position');

    // Height is derived from the single column, not the stale stored 200.
    expect(orders.h).toBe(intrinsicTableHeight(orders.data));

    // The handle strings became a structured endpoint, and the FK was backfilled.
    expect(state.edges[0].source).toMatchObject({ nodeId: 'orders', columnId: 'o-user' });
    expect(orders.data.columns[0].foreignKey).toEqual({ tableId: 'users', columnId: 'u-id' });

    // `selected: true` was persisted by the old build; it must not survive.
    expect(state.selectedNodeIds.size).toBe(0);
  });

  it('renders the toolbar', () => {
    render(<App />);
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('mounts without logging an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedLegacyDiagram();
    await useStore.persist.rehydrate();

    render(<App />);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * Wiring the engine to React and the store.
 *
 * The important property here is that **nothing in this hook re-renders per
 * frame**. The store subscription writes the latest state into a ref and calls
 * `renderer.invalidate()`; the renderer pulls from that ref inside its own rAF.
 * Panning at 60fps therefore costs zero React renders.
 */
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useStore } from '@/store';
import { diagramBounds, nodeRect, type Point } from '@/engine/geometry';
import { distanceToRoute, type Hit } from '@/engine/hitTest';
import { InteractionController, type InteractionHost, type TransientState } from '@/engine/interactions';
import { Renderer } from '@/engine/renderer';
import { routeEdges, routeMoving, routingSignature, type RouteMap } from '@/engine/routing';
import { buildScene } from '@/engine/scene';
import type { Scene } from '@/engine/primitives';
import { CanvasTextMeasurer, fontsReady } from '@/engine/text';
import type { Palette } from '@/engine/theme';
import { ViewportController, fitView, toWorld } from '@/engine/viewport';
import type { DBEdge, DBNode, SearchHighlight } from '@/types';
import { applyTransient } from './transient';
import type { InlineEdit } from './InlineEditor';

/** How close a pinned bend must sit to the automatic route to count as cleared. */
const PIN_RESET_DISTANCE = 10;

/**
 * The selected edge's pins, with an in-flight bend applied.
 *
 * So the handle under the pointer tracks it rather than staying at the pin's
 * committed position until release.
 */
function previewWaypoints(
  state: { edges: readonly DBEdge[]; selectedEdgeId: string | null },
  transient: TransientState | null
): Point[] {
  const edgeId = state.selectedEdgeId;
  if (!edgeId) return [];

  const pins = (state.edges.find((e) => e.id === edgeId)?.waypoints ?? []).map((p) => ({ ...p }));

  const bending = transient?.bending;
  if (bending?.edgeId === edgeId) {
    if (bending.index < pins.length) pins[bending.index] = bending.point;
    else pins.splice(bending.index, 0, bending.point);
  }

  return pins;
}

interface Params {
  canvasRef: RefObject<HTMLCanvasElement>;
  containerRef: RefObject<HTMLDivElement>;
  palette: Palette;
  setEditing: (edit: InlineEdit | null) => void;
  setMenu: (menu: { hit: Hit | null; at: Point } | null) => void;
}

/** Everything the render loop reads, refreshed by the store subscription. */
interface EngineState {
  nodes: readonly DBNode[];
  edges: readonly DBEdge[];
  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  searchHighlights: ReadonlyMap<string, SearchHighlight>;
  palette: Palette;
  routes: RouteMap;
}

export function useCanvasEngine({ canvasRef, containerRef, palette, setEditing, setMenu }: Params) {
  const viewport = useMemo(() => new ViewportController(), []);
  const rendererRef = useRef<Renderer | null>(null);
  const interactionsRef = useRef<InteractionController | null>(null);
  const measurerRef = useRef<CanvasTextMeasurer | null>(null);

  const stateRef = useRef<EngineState>({
    nodes: [],
    edges: [],
    selectedNodeIds: new Set(),
    selectedEdgeId: null,
    searchHighlights: new Map(),
    palette,
    routes: new Map(),
  });

  const transientRef = useRef<TransientState | null>(null);
  const didFitRef = useRef(false);

  /** Latest node list with any in-flight drag applied, plus routes to match. */
  const liveScene = useCallback(() => {
    const s = stateRef.current;
    const transient = transientRef.current;

    const nodes = transient ? applyTransient(s.nodes, transient) : s.nodes;
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    // While something is being dragged, re-route only the edges attached to it,
    // and only with the cheap elbow. Everything else keeps the routes computed
    // when the store last changed, so one moving table does not reshape the whole
    // diagram every frame. The full search re-runs on drop, via the store update.
    const dragging = transient?.dragDelta || transient?.resizePreview;
    const movingIds = transient?.resizePreview
      ? new Set([transient.resizePreview.nodeId])
      : transient?.draggingIds;

    let routes =
      dragging && movingIds
        ? routeMoving(s.edges, nodesById, movingIds, s.routes)
        : s.routes;

    // Bending a line: re-route just that one edge with the pin applied, so the
    // path follows the pointer instead of jumping into place on release. One
    // edge through the full router is well inside a frame.
    const bending = transient?.bending;
    if (bending) {
      const edge = s.edges.find((e) => e.id === bending.edgeId);
      if (edge) {
        const pins = [...(edge.waypoints ?? []).map((p) => ({ ...p }))];
        if (bending.index < pins.length) pins[bending.index] = bending.point;
        else pins.splice(bending.index, 0, bending.point);

        const preview = routeEdges([{ ...edge, waypoints: pins }], nodesById).get(edge.id);
        if (preview) {
          routes = new Map(routes);
          routes.set(edge.id, preview);
        }
      }
    }

    return { nodes, nodesById, routes, transient };
  }, []);

  // --- Engine lifecycle -----------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return;
    const measurer = new CanvasTextMeasurer(measureCtx);
    measurerRef.current = measurer;

    const renderer: Renderer = new Renderer(canvas, {
      getViewport: () => viewport.get(),
      getBackground: () => stateRef.current.palette.background,
      getScene: (): Scene => {
        const s = stateRef.current;
        const { nodes, routes, transient } = liveScene();

        return buildScene({
          nodes,
          edges: s.edges,
          routes,
          viewport: viewport.get(),
          size: renderer.size,
          palette: s.palette,
          measurer,
          selectedNodeIds: s.selectedNodeIds,
          selectedEdgeId: s.selectedEdgeId,
          searchHighlights: s.searchHighlights,
          hoveredNodeId: transient?.hoveredNodeId ?? null,
          hoveredEdgeId: transient?.hoveredEdgeId ?? null,
          marquee: transient?.marquee ?? null,
          pendingConnection: transient?.pendingConnection ?? null,
          selectedEdgeWaypoints: previewWaypoints(s, transient),
          movingEnd: transient?.movingEnd ?? null,
        });
      },
    });
    rendererRef.current = renderer;

    const host: InteractionHost = {
      getNodes: () => liveScene().nodes,
      getEdges: () => stateRef.current.edges,
      getRoutes: () => liveScene().routes,
      getSelectedNodeIds: () => stateRef.current.selectedNodeIds,

      selectNode: (nodeId, additive) => useStore.getState().selectNode(nodeId, additive),
      selectNodes: (nodeIds) => useStore.getState().setSelectedNodes(nodeIds),
      selectEdge: (edgeId) => useStore.getState().setSelectedEdge(edgeId),
      clearSelection: () => useStore.getState().clearSelection(),

      moveNodes: (nodeIds, delta) => useStore.getState().moveNodes(nodeIds, delta),
      resizeNode: (nodeId, rect) => useStore.getState().resizeNode(nodeId, rect),

      connect: (source, target) => {
        const store = useStore.getState();
        const targetNode = store.nodes.find((n) => n.id === target.nodeId);

        // Dropped on a table body rather than a specific column: the user has
        // said which table but not which column, so finish in the picker with
        // both ends seeded rather than guessing or silently doing nothing.
        if (!target.columnId && targetNode?.type === 'table') {
          store.openConnect({ source, target });
          return;
        }

        store.createRelationship({ source, target });
      },

      getSelectedEdgeId: () => stateRef.current.selectedEdgeId,

      setWaypoints: (edgeId, waypoints) =>
        useStore.getState().setEdgeWaypoints(edgeId, waypoints),

      reanchor: (edgeId, which, ref) =>
        useStore.getState().setEdgeEndpoint(edgeId, which, ref),

      /**
       * Would these pins change anything?
       *
       * Dragging a bend back onto the automatic route is how a user undoes it,
       * so a pin that the router would have passed through anyway is treated as
       * a reset instead of being stored forever.
       */
      isRedundantPin: (edgeId, waypoints) => {
        const s = stateRef.current;
        const edge = s.edges.find((e) => e.id === edgeId);
        if (!edge || waypoints.length === 0) return true;

        const nodesById = new Map(s.nodes.map((n) => [n.id, n]));
        const auto = routeEdges([{ ...edge, waypoints: undefined }], nodesById).get(edgeId);
        if (!auto) return false;

        return waypoints.every((pin) => distanceToRoute(pin, auto) <= PIN_RESET_DISTANCE);
      },

      openContextMenu: (hit, at) => setMenu({ hit, at }),
      activate: (hit) => {
        const node = stateRef.current.nodes.find(
          (n) => 'nodeId' in hit && n.id === (hit as { nodeId: string }).nodeId
        );
        if (!node) return;

        // Double-click opens the thing you clicked for editing in place.
        if (node.type === 'note') {
          setEditing({ kind: 'note-content', nodeId: node.id, rect: nodeRect(node) });
        } else if (node.type === 'table' || node.type === 'group') {
          setEditing({ kind: 'name', nodeId: node.id, rect: nodeRect(node) });
        }
      },

      requestRender: () => {
        transientRef.current = interactionsRef.current?.getTransient() ?? null;
        renderer.invalidate();
      },
    };

    const interactions = new InteractionController(canvas, viewport, host);
    interactionsRef.current = interactions;

    const unsubscribeViewport = viewport.subscribe(() => renderer.invalidate());

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer.resize(width, height);

      // Frame the diagram the first time we know how big the canvas is.
      if (!didFitRef.current && width > 0 && stateRef.current.nodes.length > 0) {
        didFitRef.current = true;
        viewport.set(fitView(diagramBounds([...stateRef.current.nodes]), { width, height }));
      }
    });
    resizeObserver.observe(container);

    // Measurements taken against a fallback face are wrong for the real one.
    let cancelled = false;
    void fontsReady().then(() => {
      if (cancelled) return;
      measurer.clear();
      renderer.clearCache();
    });

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      unsubscribeViewport();
      interactions.destroy();
      renderer.dispose();
      viewport.destroy();
      rendererRef.current = null;
      interactionsRef.current = null;
    };
  }, [canvasRef, containerRef, liveScene, setEditing, setMenu, viewport]);

  // --- Store subscription ---------------------------------------------------

  useEffect(() => {
    // Identity is too coarse a trigger for the router: renaming a column or
    // recolouring an edge replaces the array without moving a single line, and
    // a full reroute is tens of milliseconds on a large diagram.
    let signature: string | null = null;

    const sync = (s: ReturnType<typeof useStore.getState>) => {
      const nodesChanged = s.nodes !== stateRef.current.nodes;
      const edgesChanged = s.edges !== stateRef.current.edges;

      let routes = stateRef.current.routes;
      if (nodesChanged || edgesChanged || signature === null) {
        const next = routingSignature(s.nodes, s.edges);
        if (next !== signature) {
          signature = next;
          routes = routeEdges(s.edges, new Map(s.nodes.map((n) => [n.id, n])));
        }
      }

      stateRef.current = {
        nodes: s.nodes,
        edges: s.edges,
        selectedNodeIds: s.selectedNodeIds,
        selectedEdgeId: s.selectedEdgeId,
        searchHighlights: s.searchHighlights,
        palette: stateRef.current.palette,
        routes,
      };

      rendererRef.current?.invalidate();
    };

    sync(useStore.getState());
    return useStore.subscribe(sync);
  }, []);

  // Palette changes invalidate every cached bitmap.
  useEffect(() => {
    stateRef.current = { ...stateRef.current, palette };
    rendererRef.current?.clearCache();
  }, [palette]);

  // --- Space-to-pan ---------------------------------------------------------

  useEffect(() => {
    /**
     * Space is only ours when the canvas is what the user is on.
     *
     * This used to fire for any Space pressed outside a text field, and
     * `preventDefault()` on Space suppresses a focused button's activation — so
     * holding space to pan also broke keyboard operation of every toolbar
     * button, menu item and dialog control in the app.
     */
    const canvasHasFocus = () => {
      const el = document.activeElement;
      return el === null || el === document.body || el === canvasRef.current;
    };

    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && canvasHasFocus()) {
        e.preventDefault();
        interactionsRef.current?.setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') interactionsRef.current?.setSpaceHeld(false);
    };

    // A window that loses focus never delivers the keyup, which would otherwise
    // leave the canvas stuck in pan mode.
    const release = () => interactionsRef.current?.setSpaceHeld(false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [canvasRef]);

  // --- Imperative camera, for search and the toolbar ------------------------

  const fitToDiagram = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    viewport.set(fitView(diagramBounds([...stateRef.current.nodes]), renderer.size), {
      animate: true,
    });
  }, [viewport]);

  const centerOnNode = useCallback(
    (nodeId: string, zoom = 1) => {
      const renderer = rendererRef.current;
      const node = stateRef.current.nodes.find((n) => n.id === nodeId);
      if (!renderer || !node) return;

      const r = nodeRect(node);
      viewport.set(fitView(r, renderer.size, 160, zoom), { animate: true });
    },
    [viewport]
  );

  const viewportCenterWorld = useCallback((): Point => {
    const size = rendererRef.current?.size ?? { width: 0, height: 0 };
    return toWorld({ x: size.width / 2, y: size.height / 2 }, viewport.get());
  }, [viewport]);

  const getSize = useCallback(
    () => rendererRef.current?.size ?? { width: 0, height: 0 },
    []
  );

  return {
    viewport,
    fitToDiagram,
    centerOnNode,
    viewportCenterWorld,
    getSize,
  };
}

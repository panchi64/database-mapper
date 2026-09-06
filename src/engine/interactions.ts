/**
 * Pointer handling, as an explicit state machine.
 *
 * Two decisions shape this file:
 *
 * 1. **Drags are transient until they commit.** While a node is being dragged its
 *    offset lives here, not in the store. The store is written once, on pointer-up,
 *    as a single undoable step. The old React Flow path pushed a state update on
 *    every pointer-move, which meant 60 store writes and 60 history entries per
 *    second of dragging.
 * 2. **Pointer Events, with capture.** One code path covers mouse, touch and pen,
 *    and capture means a drag that leaves the canvas still tracks correctly.
 */
import {
  METRICS,
  nodeRect,
  nodeSizeLimits,
  type Point,
  type Rect,
  type SizeLimits,
} from './geometry';
import { normalizeRect, nodesInRect, pick, type Hit } from './hitTest';
import type { RouteMap } from './routing';
import { toWorld, zoomAt, type Viewport, type ViewportController } from './viewport';
import type { DBEdge, DBNode, EndpointRef } from '@/types';

export type InteractionMode =
  | 'idle'
  | 'panning'
  | 'marquee'
  | 'dragNodes'
  | 'resizing'
  | 'connecting'
  /** Dragging the line itself, which pins a waypoint. */
  | 'bendingEdge'
  /** Dragging an end of the selected edge onto a different column. */
  | 'movingEndpoint';

export interface TransientState {
  mode: InteractionMode;
  /** Offset applied to every dragged node until the drag commits. */
  dragDelta: Point | null;
  draggingIds: ReadonlySet<string>;
  /** Live size override for the node being resized. */
  resizePreview: { nodeId: string; rect: Rect } | null;
  marquee: Rect | null;
  pendingConnection: { from: Point; to: Point } | null;
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  /** Live waypoint override while a line is being bent. */
  bending: { edgeId: string; index: number; point: Point } | null;
  /** Live endpoint override while an end is being re-anchored. */
  movingEnd: { edgeId: string; which: 'source' | 'target'; point: Point } | null;
}

export interface InteractionHost {
  getNodes(): readonly DBNode[];
  getEdges(): readonly DBEdge[];
  getRoutes(): RouteMap;
  getSelectedNodeIds(): ReadonlySet<string>;

  selectNode(nodeId: string, additive: boolean): void;
  selectNodes(nodeIds: string[]): void;
  selectEdge(edgeId: string): void;
  clearSelection(): void;

  /** Commit a finished node drag as one undoable step. */
  moveNodes(nodeIds: string[], delta: Point): void;
  resizeNode(nodeId: string, rect: Rect): void;
  connect(source: EndpointRef, target: EndpointRef): void;
  getSelectedEdgeId(): string | null;
  /** Commit a finished line bend. An empty array clears the pins. */
  setWaypoints(edgeId: string, waypoints: Point[]): void;
  /**
   * Would these pins produce the same route as no pins at all? Answered by the
   * host because it owns the router.
   */
  isRedundantPin(edgeId: string, waypoints: Point[]): boolean;
  /** Commit a finished endpoint drag. */
  reanchor(edgeId: string, which: 'source' | 'target', ref: EndpointRef): void;

  openContextMenu(hit: Hit | null, screen: Point): void;
  activate(hit: Hit): void;
  requestRender(): void;
}

const DRAG_THRESHOLD = 4;
const ZOOM_SPEED = 0.0015;

/**
 * Pixels one unit of `WheelEvent.deltaY` means, indexed by `deltaMode`
 * (0 = pixel, 1 = line, 2 = page). Only Chrome-family browsers report pixels;
 * Firefox reports lines and some remotes report pages.
 */
const WHEEL_UNIT_PX: Record<number, number> = { 0: 1, 1: 16, 2: 400 };

function snap(value: number): number {
  return Math.round(value / METRICS.gridSnap) * METRICS.gridSnap;
}

/**
 * The offset to apply to a dragged selection.
 *
 * `anchorStart` is the dragged node's position *when the drag began*, never its
 * current one. Snapping the resulting position against a position that already
 * includes the snap feeds the output back into the input, and the node oscillates
 * between two grid cells as the pointer moves.
 *
 * Exported for testing; the controller is the only caller.
 */
export function snapDelta(
  anchorStart: Point | null,
  rawDelta: Point,
  freeform: boolean
): Point {
  if (freeform || !anchorStart) return rawDelta;

  return {
    x: snap(anchorStart.x + rawDelta.x) - anchorStart.x,
    y: snap(anchorStart.y + rawDelta.y) - anchorStart.y,
  };
}

/**
 * Where a new pin belongs in the waypoint sequence.
 *
 * Waypoints are visited in order, so inserting one in the wrong slot makes the
 * route double back on itself. The right slot is decided by how far along the
 * current path the grab happened, relative to the existing pins.
 *
 * Exported for testing.
 */
export function insertionIndex(
  route: readonly Point[] | undefined,
  waypoints: readonly Point[],
  grab: Point
): number {
  if (waypoints.length === 0) return 0;
  if (!route || route.length < 2) return waypoints.length;

  const along = (p: Point) => {
    // Distance along the polyline to the point on it nearest `p`.
    let travelled = 0;
    let best = { distance: Infinity, at: 0 };

    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const segment = Math.sqrt(lenSq);

      let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;

      const cx = a.x + t * dx;
      const cy = a.y + t * dy;
      const distance = Math.hypot(p.x - cx, p.y - cy);

      if (distance < best.distance) best = { distance, at: travelled + t * segment };
      travelled += segment;
    }

    return best.at;
  };

  const grabAt = along(grab);
  const positions = waypoints.map(along);

  let index = 0;
  while (index < positions.length && positions[index] < grabAt) index++;
  return index;
}

export class InteractionController {
  private mode: InteractionMode = 'idle';

  private pointerId: number | null = null;
  private startScreen: Point = { x: 0, y: 0 };
  private startWorld: Point = { x: 0, y: 0 };
  private startViewport: Viewport = { x: 0, y: 0, zoom: 1 };
  private passedThreshold = false;
  private altHeld = false;

  private draggingIds: Set<string> = new Set();
  private dragDelta: Point | null = null;
  /**
   * Committed position of the node the snap is measured from, captured once when
   * the drag starts. Must not be re-read during the drag: the live node list
   * already has the current offset applied, so snapping against it would feed the
   * result back into its own input and oscillate.
   */
  private dragAnchorStart: Point | null = null;

  private resizeStart: {
    nodeId: string;
    rect: Rect;
    corner: string;
    limits: SizeLimits;
  } | null = null;
  private resizePreview: { nodeId: string; rect: Rect } | null = null;

  private marquee: Rect | null = null;
  private marqueeAdditive = false;

  private connectFrom: { ref: EndpointRef; point: Point } | null = null;
  private connectTo: Point | null = null;

  private hoveredNodeId: string | null = null;
  private hoveredEdgeId: string | null = null;

  private bending: { edgeId: string; index: number; point: Point; existing: Point[] } | null = null;
  private movingEnd: { edgeId: string; which: 'source' | 'target'; point: Point } | null = null;

  /** Set while the space bar is down, which turns any drag into a pan. */
  private spaceHeld = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private viewport: ViewportController,
    private host: InteractionHost
  ) {
    this.attach();
  }

  getTransient(): TransientState {
    return {
      mode: this.mode,
      dragDelta: this.dragDelta,
      draggingIds: this.draggingIds,
      resizePreview: this.resizePreview,
      marquee: this.marquee,
      pendingConnection:
        this.connectFrom && this.connectTo
          ? { from: this.connectFrom.point, to: this.connectTo }
          : null,
      hoveredNodeId: this.hoveredNodeId,
      hoveredEdgeId: this.hoveredEdgeId,
      bending: this.bending
        ? { edgeId: this.bending.edgeId, index: this.bending.index, point: this.bending.point }
        : null,
      movingEnd: this.movingEnd,
    };
  }

  setSpaceHeld(held: boolean): void {
    if (this.spaceHeld === held) return;
    this.spaceHeld = held;
    this.updateCursor();
  }

  destroy(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerCancel);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDoubleClick);
    c.removeEventListener('contextmenu', this.onContextMenu);
  }

  private attach(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerCancel);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDoubleClick);
    c.addEventListener('contextmenu', this.onContextMenu);
  }

  private screenPoint(e: PointerEvent | MouseEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private hitAt(screen: Point): Hit | null {
    return pick(toWorld(screen, this.viewport.get()), {
      nodes: this.host.getNodes(),
      edges: this.host.getEdges(),
      routes: this.host.getRoutes(),
      zoom: this.viewport.get().zoom,
      activeNodeId: this.hoveredNodeId,
      selectedNodeIds: this.host.getSelectedNodeIds(),
      selectedEdgeId: this.host.getSelectedEdgeId(),
    });
  }

  // --- Pointer down ---------------------------------------------------------

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;

    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    // Space-to-pan is only armed while the canvas has focus, so make sure
    // touching it gives it focus — a `<canvas>` is not focused by a click in
    // every browser even with `tabindex`.
    this.canvas.focus({ preventScroll: true });

    const screen = this.screenPoint(e);
    this.startScreen = screen;
    this.startViewport = this.viewport.get();
    this.startWorld = toWorld(screen, this.startViewport);
    this.passedThreshold = false;
    this.altHeld = e.altKey;

    // Middle button or space-drag always pans, whatever is underneath.
    if (e.button === 1 || this.spaceHeld) {
      this.mode = 'panning';
      this.updateCursor();
      return;
    }

    if (e.button === 2) return; // context menu handled separately

    const hit = this.hitAt(screen);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (!hit) {
      this.mode = 'marquee';
      this.marqueeAdditive = additive;
      this.marquee = { x: this.startWorld.x, y: this.startWorld.y, w: 0, h: 0 };
      if (!additive) this.host.clearSelection();
      this.updateCursor();
      return;
    }

    switch (hit.kind) {
      case 'port':
        this.mode = 'connecting';
        this.connectFrom = {
          ref: { nodeId: hit.nodeId, columnId: hit.columnId },
          point: hit.point,
        };
        this.connectTo = this.startWorld;
        break;

      case 'resize': {
        const node = this.host.getNodes().find((n) => n.id === hit.nodeId);
        if (!node) break;
        this.mode = 'resizing';
        this.resizeStart = {
          nodeId: hit.nodeId,
          rect: nodeRect(node),
          corner: hit.corner,
          limits: nodeSizeLimits(node),
        };
        break;
      }

      case 'edge': {
        this.host.selectEdge(hit.edgeId);

        // Dragging the line bends it. Where the new pin goes in the sequence
        // matters: inserting it at the wrong index makes the route double back.
        const edge = this.host.getEdges().find((e) => e.id === hit.edgeId);
        const existing = (edge?.waypoints ?? []).map((p) => ({ ...p }));
        const route = this.host.getRoutes().get(hit.edgeId);

        this.mode = 'bendingEdge';
        this.bending = {
          edgeId: hit.edgeId,
          index: insertionIndex(route, existing, this.startWorld),
          point: this.startWorld,
          existing,
        };
        break;
      }

      case 'waypoint':
        this.mode = 'bendingEdge';
        this.bending = {
          edgeId: hit.edgeId,
          index: hit.index,
          point: hit.point,
          existing: (
            this.host.getEdges().find((e) => e.id === hit.edgeId)?.waypoints ?? []
          ).map((p) => ({ ...p })),
        };
        break;

      case 'edgeEnd':
        this.mode = 'movingEndpoint';
        this.movingEnd = { edgeId: hit.edgeId, which: hit.which, point: hit.point };
        break;

      case 'node':
      case 'row': {
        const selected = this.host.getSelectedNodeIds();
        // Dragging a node that is part of a multi-selection moves the whole set,
        // so don't collapse the selection to just this node.
        if (!selected.has(hit.nodeId)) {
          this.host.selectNode(hit.nodeId, additive);
        } else if (additive) {
          this.host.selectNode(hit.nodeId, true);
        }

        this.mode = 'dragNodes';
        this.draggingIds = new Set(
          this.host.getSelectedNodeIds().has(hit.nodeId)
            ? this.host.getSelectedNodeIds()
            : [hit.nodeId]
        );
        this.dragDelta = { x: 0, y: 0 };

        // Nothing is offset yet, so the node list still holds committed
        // positions — the only moment it is safe to read the snap anchor.
        const anchor = this.host.getNodes().find((n) => n.id === hit.nodeId);
        this.dragAnchorStart = anchor ? { x: anchor.x, y: anchor.y } : null;
        break;
      }
    }

    this.updateCursor();
    this.host.requestRender();
  };

  // --- Pointer move ---------------------------------------------------------

  private onPointerMove = (e: PointerEvent): void => {
    const screen = this.screenPoint(e);

    if (this.pointerId === null) {
      this.updateHover(screen);
      return;
    }

    this.altHeld = e.altKey;

    const dxScreen = screen.x - this.startScreen.x;
    const dyScreen = screen.y - this.startScreen.y;

    if (!this.passedThreshold && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) {
      return;
    }
    this.passedThreshold = true;

    switch (this.mode) {
      case 'panning': {
        this.viewport.set({
          ...this.startViewport,
          x: this.startViewport.x + dxScreen,
          y: this.startViewport.y + dyScreen,
        });
        break;
      }

      case 'marquee': {
        const world = toWorld(screen, this.viewport.get());
        this.marquee = {
          x: this.startWorld.x,
          y: this.startWorld.y,
          w: world.x - this.startWorld.x,
          h: world.y - this.startWorld.y,
        };
        break;
      }

      case 'dragNodes': {
        const zoom = this.viewport.get().zoom;
        const raw = { x: dxScreen / zoom, y: dyScreen / zoom };

        // Alt drags freely, off the grid.
        this.dragDelta = snapDelta(this.dragAnchorStart, raw, this.altHeld);
        break;
      }

      case 'resizing': {
        if (!this.resizeStart) break;
        this.resizePreview = {
          nodeId: this.resizeStart.nodeId,
          rect: resizedRect(
            this.resizeStart.rect,
            this.resizeStart.corner,
            {
              x: dxScreen / this.viewport.get().zoom,
              y: dyScreen / this.viewport.get().zoom,
            },
            this.resizeStart.limits
          ),
        };
        break;
      }

      case 'connecting': {
        this.connectTo = toWorld(screen, this.viewport.get());
        this.updateHover(screen);
        break;
      }

      case 'bendingEdge': {
        if (!this.bending) break;
        const world = toWorld(screen, this.viewport.get());
        this.bending.point = this.altHeld
          ? world
          : { x: snap(world.x), y: snap(world.y) };
        break;
      }

      case 'movingEndpoint': {
        if (!this.movingEnd) break;
        this.movingEnd = { ...this.movingEnd, point: toWorld(screen, this.viewport.get()) };
        this.updateHover(screen);
        break;
      }

      default:
        break;
    }

    this.host.requestRender();
  };

  // --- Pointer up -----------------------------------------------------------

  private onPointerUp = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    const screen = this.screenPoint(e);

    switch (this.mode) {
      case 'marquee': {
        if (this.marquee && this.passedThreshold) {
          const rect = normalizeRect(this.marquee);
          const ids = nodesInRect(this.host.getNodes(), rect);
          const next = this.marqueeAdditive
            ? [...new Set([...this.host.getSelectedNodeIds(), ...ids])]
            : ids;
          this.host.selectNodes(next);
        }
        break;
      }

      case 'dragNodes': {
        if (this.dragDelta && this.passedThreshold) {
          const moved = this.dragDelta;
          if (moved.x !== 0 || moved.y !== 0) {
            this.host.moveNodes([...this.draggingIds], moved);
          }
        }
        break;
      }

      case 'resizing': {
        if (this.resizePreview && this.passedThreshold) {
          this.host.resizeNode(this.resizePreview.nodeId, this.resizePreview.rect);
        }
        break;
      }

      case 'connecting': {
        const hit = this.hitAt(screen);
        const from = this.connectFrom;

        if (from && hit) {
          if (hit.kind === 'port' || hit.kind === 'row') {
            this.host.connect(from.ref, { nodeId: hit.nodeId, columnId: hit.columnId });
          } else if (hit.kind === 'node') {
            // Dropped on a table body rather than a specific column: the host
            // finishes in the connect picker with both ends seeded.
            this.host.connect(from.ref, { nodeId: hit.nodeId });
          }
        }
        break;
      }

      case 'bendingEdge': {
        if (!this.bending || !this.passedThreshold) break;

        const { edgeId, index, point, existing } = this.bending;
        const next = [...existing];
        if (index < next.length) next[index] = point;
        else next.splice(index, 0, point);

        // A pin that lands back on the automatic route is the user undoing the
        // bend, so treat it as a reset rather than leaving a no-op pin behind.
        this.host.setWaypoints(edgeId, this.host.isRedundantPin(edgeId, next) ? [] : next);
        break;
      }

      case 'movingEndpoint': {
        if (!this.movingEnd || !this.passedThreshold) break;

        const hit = this.hitAt(screen);
        const { edgeId, which } = this.movingEnd;

        if (hit?.kind === 'port' || hit?.kind === 'row') {
          this.host.reanchor(edgeId, which, { nodeId: hit.nodeId, columnId: hit.columnId });
        } else if (hit?.kind === 'node') {
          this.host.reanchor(edgeId, which, { nodeId: hit.nodeId });
        }
        break;
      }

      default:
        break;
    }

    this.reset();
    this.updateHover(screen);
    this.host.requestRender();
  };

  /**
   * The gesture was taken away from us — the browser claimed it for a scroll, the
   * pen left range, the touch was interrupted. That is an *abort*, so nothing
   * commits: this used to share `onPointerUp`, which meant a cancelled drag wrote
   * the node's half-way position to the store as if the user had let go there.
   */
  private onPointerCancel = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    this.reset();
    this.host.requestRender();
  };

  private onPointerLeave = (): void => {
    if (this.pointerId !== null) return;
    if (this.hoveredNodeId === null && this.hoveredEdgeId === null) return;

    this.hoveredNodeId = null;
    this.hoveredEdgeId = null;
    this.host.requestRender();
  };

  private reset(): void {
    this.pointerId = null;
    this.mode = 'idle';
    this.passedThreshold = false;
    this.draggingIds = new Set();
    this.dragDelta = null;
    this.dragAnchorStart = null;
    this.resizeStart = null;
    this.resizePreview = null;
    this.marquee = null;
    this.connectFrom = null;
    this.connectTo = null;
    this.bending = null;
    this.movingEnd = null;
    this.updateCursor();
  }

  // --- Hover, wheel, menus --------------------------------------------------

  private updateHover(screen: Point): void {
    const hit = this.hitAt(screen);

    const nodeId =
      hit && (hit.kind === 'node' || hit.kind === 'row' || hit.kind === 'port' || hit.kind === 'resize')
        ? hit.nodeId
        : null;
    const edgeId =
      hit?.kind === 'edge' || hit?.kind === 'waypoint' || hit?.kind === 'edgeEnd'
        ? hit.edgeId
        : null;

    if (nodeId === this.hoveredNodeId && edgeId === this.hoveredEdgeId) return;

    this.hoveredNodeId = nodeId;
    this.hoveredEdgeId = edgeId;
    this.updateCursor(hit);
    this.host.requestRender();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const screen = this.screenPoint(e);

    // `deltaY` is only in pixels when `deltaMode` is 0. Firefox reports lines
    // (mode 1, ~3 per notch), so reading it raw made a wheel notch there worth
    // 3 units instead of ~100 and zoom barely moved.
    const unit = WHEEL_UNIT_PX[e.deltaMode] ?? 1;
    const dy = e.deltaY * unit;
    const dx = e.deltaX * unit;

    // Trackpad pinch arrives as a wheel event with ctrlKey set; a plain wheel
    // with a modifier-free delta is treated as zoom too, which is what a diagram
    // canvas is expected to do. Shift+wheel pans horizontally — but several
    // browsers already move the scroll onto `deltaX` for us when shift is held,
    // leaving `deltaY` at zero, so take whichever axis actually carries it.
    if (e.shiftKey && !e.ctrlKey) {
      const pan = dx || dy;
      this.viewport.update((vp) => ({ ...vp, x: vp.x - pan }));
      this.host.requestRender();
      return;
    }

    const factor = Math.exp(-dy * ZOOM_SPEED);
    this.viewport.update((vp) => zoomAt(vp, screen, factor));
    this.host.requestRender();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const hit = this.hitAt(this.screenPoint(e));
    if (hit) this.host.activate(hit);
  };

  private onContextMenu = (e: MouseEvent): void => {
    // Hit-test before the menu opens so its items can describe what was clicked.
    const screen = this.screenPoint(e);
    this.host.openContextMenu(this.hitAt(screen), { x: e.clientX, y: e.clientY });
  };

  private updateCursor(hit?: Hit | null): void {
    const style = this.canvas.style;

    if (this.mode === 'panning') return void (style.cursor = 'grabbing');
    if (this.spaceHeld) return void (style.cursor = 'grab');
    if (this.mode === 'dragNodes') return void (style.cursor = 'move');
    if (this.mode === 'connecting' || this.mode === 'movingEndpoint') {
      return void (style.cursor = 'crosshair');
    }
    if (this.mode === 'bendingEdge') return void (style.cursor = 'grabbing');

    switch (hit?.kind) {
      case 'port':
        style.cursor = 'crosshair';
        break;
      case 'resize':
        style.cursor = hit.corner === 'nw' || hit.corner === 'se' ? 'nwse-resize' : 'nesw-resize';
        break;
      case 'node':
      case 'row':
        style.cursor = 'pointer';
        break;
      case 'edge':
        style.cursor = 'pointer';
        break;
      case 'waypoint':
      case 'edgeEnd':
        style.cursor = 'grab';
        break;
      default:
        style.cursor = 'default';
    }
  }
}

/**
 * Apply a resize drag to a rect, keeping the opposite corner pinned.
 *
 * `limits` comes from `nodeSizeLimits`, so the preview clamps exactly where the
 * commit will. Passing the wrong node's limits is what made a note refuse to go
 * below the *table* minimum width, and let a table preview wider than it could
 * ever commit.
 */
export function resizedRect(rect: Rect, corner: string, delta: Point, limits: SizeLimits): Rect {
  let { x, y, w, h } = rect;
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';

  if (west) {
    x += delta.x;
    w -= delta.x;
  } else {
    w += delta.x;
  }

  // Flipping through zero would invert the node; clamp instead, moving the
  // dragged edge back rather than the pinned one.
  if (w < limits.minW) {
    if (west) x -= limits.minW - w;
    w = limits.minW;
  } else if (w > limits.maxW) {
    if (west) x += w - limits.maxW;
    w = limits.maxW;
  }

  // A node whose height is derived (a table) has nothing to resize vertically,
  // and moving `y` from a top handle would translate it instead.
  if (limits.fixedHeight) return { x, y, w, h: limits.minH };

  if (north) {
    y += delta.y;
    h -= delta.y;
  } else {
    h += delta.y;
  }

  if (h < limits.minH) {
    if (north) y -= limits.minH - h;
    h = limits.minH;
  }

  return { x, y, w, h };
}

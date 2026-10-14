import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNoteGraph } from "@/hooks/useNoteGraph";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { Simulation, type SimNode } from "@/lib/forceSimulation";
import { noteName } from "@/lib/noteGraph";
import {
  fitToNodes,
  nodeAtScreenPoint,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from "@/lib/graphViewport";
import styles from "./GraphView.module.css";

/** Labels would be unreadable mush below this zoom, so only the nodes the
 *  user is pointing at (and their neighbours) keep theirs. */
const LABEL_SCALE_THRESHOLD = 0.55;
/** Pointer travel, in pixels, that turns a click into a drag. Below it a
 *  click on a node still counts as a click even if the hand wobbles. */
const DRAG_THRESHOLD = 4;
const WHEEL_ZOOM_RATE = 0.0016;

interface PaletteColors {
  node: string;
  nodeSelected: string;
  nodeDim: string;
  edge: string;
  edgeActive: string;
  label: string;
  labelStrong: string;
}

const FALLBACK_PALETTE: PaletteColors = {
  node: "#8f8f8f",
  nodeSelected: "#1a5fb4",
  nodeDim: "#d8d8d8",
  edge: "#d8d8d8",
  edgeActive: "#1a5fb4",
  label: "#6b6b6b",
  labelStrong: "#1a1a1a",
};

function readPalette(el: HTMLElement | null): PaletteColors {
  if (!el) return FALLBACK_PALETTE;
  const style = getComputedStyle(el);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    node: read("--graph-node", FALLBACK_PALETTE.node),
    nodeSelected: read("--graph-node-selected", FALLBACK_PALETTE.nodeSelected),
    nodeDim: read("--graph-node-dim", FALLBACK_PALETTE.nodeDim),
    edge: read("--graph-edge", FALLBACK_PALETTE.edge),
    edgeActive: read("--graph-edge-active", FALLBACK_PALETTE.edgeActive),
    label: read("--graph-label", FALLBACK_PALETTE.label),
    labelStrong: read("--graph-label-strong", FALLBACK_PALETTE.labelStrong),
  };
}

/**
 * The note graph, Obsidian-style: every markdown file in the open workspaces
 * as a dot, every link between two of them as a line, arranged by the force
 * layout in `forceSimulation.ts`.
 *
 * Rendered to a canvas rather than SVG — a vault of a few thousand notes is
 * a few thousand nodes and as many edges redrawn every frame while the layout
 * settles, which is far more DOM churn than React or the browser wants.
 *
 * Nothing here is React state: the layout changes sixty times a second and
 * re-rendering at that rate would be pointless, so positions, viewport and
 * pointer state live in refs and the canvas is drawn imperatively.
 */
export function GraphView() {
  const { data: graph, isLoading, isError, error } = useNoteGraph(true);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const selectFile = useWorkspaceStore((s) => s.selectFile);
  const setWritingMode = useUiStore((s) => s.setWritingMode);

  const paneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const simRef = useRef<Simulation | null>(null);
  const viewportRef = useRef<Viewport>({ scale: 1, centerX: 0, centerY: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });
  const paletteRef = useRef<PaletteColors>(FALLBACK_PALETTE);
  const hoverRef = useRef<SimNode | null>(null);
  const selectedRef = useRef<string | null>(selectedFilePath);
  const fittedRef = useRef(false);
  /** Set the moment the user pans, zooms or drags. The settle-fit below backs
   *  off after that — re-framing a view somebody has just positioned by hand
   *  is the most annoying thing a graph can do. */
  const userMovedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const drawPendingRef = useRef(false);

  /** Pointer gesture in progress: panning the view, or dragging one node. */
  const gestureRef = useRef<{
    kind: "pan" | "node";
    node: SimNode | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const simulation = useMemo(() => (graph ? new Simulation(graph) : null), [graph]);

  /** Who each note is linked to, for the hover highlight. */
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!graph) return map;
    for (const edge of graph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [graph]);

  selectedRef.current = selectedFilePath;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = sizeRef.current;
    const viewport = viewportRef.current;
    const palette = paletteRef.current;
    const hovered = hoverRef.current;
    const selected = selectedRef.current;

    ctx.clearRect(0, 0, width, height);

    // While a node is hovered, it and its neighbours stay at full strength
    // and everything else fades back — the way Obsidian's graph answers
    // "what is this connected to?".
    const focus = hovered?.path ?? null;
    const focusNeighbors = focus ? neighbors.get(focus) : undefined;
    const inFocus = (path: string) => !focus || path === focus || !!focusNeighbors?.has(path);

    ctx.lineWidth = 1;
    for (const edge of sim.edges) {
      const active = focus !== null && (edge.source.path === focus || edge.target.path === focus);
      if (focus !== null && !active) {
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = palette.edge;
      } else {
        ctx.globalAlpha = active ? 0.85 : 0.4;
        ctx.strokeStyle = active ? palette.edgeActive : palette.edge;
      }
      const from = worldToScreen(viewport, width, height, edge.source.x, edge.source.y);
      const to = worldToScreen(viewport, width, height, edge.target.x, edge.target.y);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    const labelled: { node: SimNode; screen: { x: number; y: number }; strong: boolean }[] = [];

    for (const node of sim.nodes) {
      const screen = worldToScreen(viewport, width, height, node.x, node.y);
      const radius = Math.max(node.radius * viewport.scale, 1.5);

      // Skip what's off screen — on a big vault at a tight zoom that's most
      // of the graph, and an arc() per node adds up.
      if (
        screen.x < -radius ||
        screen.y < -radius ||
        screen.x > width + radius ||
        screen.y > height + radius
      ) {
        continue;
      }

      const isSelected = node.path === selected;
      const focused = inFocus(node.path);

      ctx.globalAlpha = focused ? 1 : 0.2;
      ctx.fillStyle = isSelected ? palette.nodeSelected : focused ? palette.node : palette.nodeDim;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // A ring marks the open note, so it stays findable at any zoom.
      if (isSelected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette.nodeSelected;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      const wantsLabel =
        node.path === focus ||
        isSelected ||
        (focus !== null ? !!focusNeighbors?.has(node.path) : viewport.scale >= LABEL_SCALE_THRESHOLD);
      if (wantsLabel) {
        labelled.push({ node, screen, strong: node.path === focus || isSelected });
      }
    }

    // Labels last, so no node is drawn over its own name.
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const { node, screen, strong } of labelled) {
      ctx.font = `${strong ? 600 : 400} 11px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = strong ? palette.labelStrong : palette.label;
      const radius = Math.max(node.radius * viewport.scale, 1.5);
      ctx.fillText(noteName(node.path), screen.x, screen.y + radius + 4);
    }
  }, [neighbors]);

  /** Draws on the next frame. Collapses several requests in one frame into
   *  one repaint, and never fights the running layout loop. */
  const requestDraw = useCallback(() => {
    if (drawPendingRef.current || rafRef.current !== null) return;
    drawPendingRef.current = true;
    requestAnimationFrame(() => {
      drawPendingRef.current = false;
      draw();
    });
  }, [draw]);

  /** Runs the layout to a standstill, drawing each step, then stops. */
  const runLayout = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      const sim = simRef.current;
      if (!sim) {
        rafRef.current = null;
        return;
      }
      const dragging = gestureRef.current?.kind === "node";
      const moving = sim.tick();

      // The first fit runs on seeded positions, before the layout has spread
      // out — so re-frame once it comes to rest and the graph's real extent
      // is known. Only once, and never over a view the user has moved.
      if (!moving && !dragging && !userMovedRef.current && sizeRef.current.width > 0) {
        viewportRef.current = fitToNodes(sim.nodes, sizeRef.current.width, sizeRef.current.height);
      }

      draw();
      // A drag keeps the loop alive even once the layout has cooled, so the
      // node follows the pointer instead of freezing under it.
      rafRef.current = moving || dragging ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [draw]);

  // Adopt a freshly built simulation and lay it out.
  useEffect(() => {
    const previous = simRef.current;
    simRef.current = simulation;
    if (!simulation) {
      fittedRef.current = false;
      userMovedRef.current = false;
      return;
    }

    // Every filesystem event invalidates the graph query while this view is
    // open, so a rebuild here is routine rather than a fresh start: carry the
    // old positions over so the notes that are still there stay where they
    // were, and leave a view the user has framed by hand alone. Only a graph
    // with nothing in common with the last one starts over.
    const carried = previous ? simulation.adoptPositions(previous) : false;
    if (!carried) {
      fittedRef.current = false;
      userMovedRef.current = false;
    }

    // The hovered node and any node being dragged belong to the old run; the
    // same notes are different objects now.
    hoverRef.current = simulation.node(hoverRef.current?.path ?? "") ?? null;
    const gesture = gestureRef.current;
    if (gesture?.kind === "node") {
      const node = simulation.node(gesture.node?.path ?? "") ?? null;
      if (node) {
        node.fixed = true;
        gesture.node = node;
      } else {
        gestureRef.current = null;
      }
    }

    if (!userMovedRef.current && sizeRef.current.width > 0) {
      viewportRef.current = fitToNodes(simulation.nodes, sizeRef.current.width, sizeRef.current.height);
      fittedRef.current = true;
    }
    runLayout();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [simulation, runLayout]);

  // Canvas sizing. The backing store is in device pixels and the context is
  // scaled to match, so lines and labels are sharp on a Retina display while
  // the drawing code keeps working in CSS pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    const pane = paneRef.current;
    if (!canvas || !pane) return;

    const resize = () => {
      const rect = pane.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      // First real size: fit the graph now that there's a viewport to fit to.
      const sim = simRef.current;
      if (sim && !fittedRef.current && rect.width > 0) {
        viewportRef.current = fitToNodes(sim.nodes, rect.width, rect.height);
        fittedRef.current = true;
      }
      requestDraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [requestDraw]);

  // Canvas can't read CSS custom properties, so the palette is sampled from
  // the pane — once, and again whenever the OS flips between light and dark
  // (which is the only thing that changes it; the app follows the OS).
  useEffect(() => {
    const refresh = () => {
      paletteRef.current = readPalette(paneRef.current);
      requestDraw();
    };
    refresh();
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", refresh);
    return () => query.removeEventListener("change", refresh);
  }, [requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [selectedFilePath, requestDraw]);

  // Pointer and wheel handling, on the DOM rather than through React: the
  // wheel listener has to be non-passive to preventDefault, and a drag needs
  // to keep tracking after the pointer leaves the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const hitTest = (x: number, y: number) => {
      const sim = simRef.current;
      if (!sim) return null;
      const { width, height } = sizeRef.current;
      return nodeAtScreenPoint(sim.nodes, viewportRef.current, width, height, x, y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const { x, y } = localPoint(event);
      const node = hitTest(x, y);
      canvas.setPointerCapture(event.pointerId);
      gestureRef.current = {
        kind: node ? "node" : "pan",
        node,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: false,
      };
      if (node) {
        node.fixed = true;
        userMovedRef.current = true;
        simRef.current?.reheat();
        runLayout();
      }
      canvas.dataset.dragging = "true";
    };

    const onPointerMove = (event: PointerEvent) => {
      const { x, y } = localPoint(event);
      const gesture = gestureRef.current;

      if (!gesture) {
        const node = hitTest(x, y);
        if (node !== hoverRef.current) {
          hoverRef.current = node;
          canvas.dataset.overNode = node ? "true" : "false";
          canvas.title = node ? `${noteName(node.path)} — double-click to open` : "";
          requestDraw();
        }
        return;
      }

      if (!gesture.moved && Math.hypot(x - gesture.startX, y - gesture.startY) > DRAG_THRESHOLD) {
        gesture.moved = true;
      }

      if (gesture.kind === "node" && gesture.node) {
        const { width, height } = sizeRef.current;
        const world = screenToWorld(viewportRef.current, width, height, x, y);
        gesture.node.x = world.x;
        gesture.node.y = world.y;
        simRef.current?.reheat();
        runLayout();
      } else {
        // Panning moves the world under a still pointer, so the view centre
        // moves against the drag.
        userMovedRef.current = true;
        const scale = viewportRef.current.scale;
        viewportRef.current = {
          ...viewportRef.current,
          centerX: viewportRef.current.centerX - (x - gesture.lastX) / scale,
          centerY: viewportRef.current.centerY - (y - gesture.lastY) / scale,
        };
        requestDraw();
      }

      gesture.lastX = x;
      gesture.lastY = y;
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      delete canvas.dataset.dragging;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!gesture) return;

      if (gesture.node) {
        // Released where it was dropped, then let the layout settle around it.
        gesture.node.fixed = false;
        simRef.current?.reheat(0.2);
        runLayout();
      }

      // A click that didn't travel selects the note; opening it is the
      // double-click, so single clicks can explore the graph without
      // yanking the user out of it.
      if (!gesture.moved && gesture.node) selectFile(gesture.node.path);
    };

    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = hitTest(event.clientX - rect.left, event.clientY - rect.top);
      if (!node) return;
      selectFile(node.path);
      setWritingMode("write");
    };

    const onPointerLeave = () => {
      if (gestureRef.current) return;
      if (hoverRef.current) {
        hoverRef.current = null;
        canvas.dataset.overNode = "false";
        requestDraw();
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userMovedRef.current = true;
      const { x, y } = localPoint(event);
      const { width, height } = sizeRef.current;
      // Exponential, so each notch scales by a constant ratio and zooming
      // feels the same at every level.
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_RATE);
      viewportRef.current = zoomAt(viewportRef.current, width, height, x, y, factor);
      requestDraw();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [requestDraw, runLayout, selectFile, setWritingMode]);

  const handleFit = () => {
    const sim = simRef.current;
    if (!sim) return;
    const { width, height } = sizeRef.current;
    viewportRef.current = fitToNodes(sim.nodes, width, height);
    userMovedRef.current = false;
    requestDraw();
  };

  const handleRelayout = () => {
    simRef.current?.reheat(1);
    runLayout();
  };

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  let message: React.ReactNode = null;
  if (isLoading) {
    message = <p>Reading your notes…</p>;
  } else if (isError) {
    message = <p>Couldn’t read the vault: {error instanceof Error ? error.message : "unknown error"}</p>;
  } else if (nodeCount === 0) {
    message = <p>No markdown files in the open workspaces yet.</p>;
  } else if (edgeCount === 0) {
    message = (
      <>
        <p>No links between your notes yet.</p>
        <p>
          Link one note to another with a relative markdown link —{" "}
          <code>[another note](./another-note.md)</code> — and it shows up here as a connection.
        </p>
      </>
    );
  }

  return (
    <div ref={paneRef} className={`${styles.pane} ${styles.palette}`}>
      <canvas ref={canvasRef} className={styles.canvas} />

      {message && (
        <div className={styles.overlay}>
          <div className={styles.message}>{message}</div>
        </div>
      )}

      {nodeCount > 0 && (
        <>
          <div className={styles.stats}>
            <span>
              {nodeCount} {nodeCount === 1 ? "note" : "notes"}
            </span>
            <span>
              {edgeCount} {edgeCount === 1 ? "link" : "links"}
            </span>
            {graph!.unresolvedCount > 0 && <span>{graph!.unresolvedCount} broken</span>}
          </div>
          <div className={styles.controls}>
            <button type="button" onClick={handleRelayout} title="Run the layout again from where it is">
              Relax
            </button>
            <button type="button" onClick={handleFit} title="Fit the whole graph in view">
              Fit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

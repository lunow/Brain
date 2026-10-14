import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  fitToNodes,
  nodeAtScreenPoint,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from "./graphViewport";
import type { SimNode } from "./forceSimulation";

const WIDTH = 800;
const HEIGHT = 600;

function node(path: string, x: number, y: number, radius = 6): SimNode {
  return { path, x, y, vx: 0, vy: 0, radius, fixed: false };
}

const CENTERED: Viewport = { scale: 1, centerX: 0, centerY: 0 };

describe("clampScale", () => {
  it("holds the scale inside its limits", () => {
    expect(clampScale(0.000001)).toBe(MIN_SCALE);
    expect(clampScale(9999)).toBe(MAX_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe("worldToScreen / screenToWorld", () => {
  it("draws the viewport centre at the canvas centre", () => {
    const screen = worldToScreen({ scale: 2, centerX: 10, centerY: 20 }, WIDTH, HEIGHT, 10, 20);
    expect(screen).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
  });

  it("round-trips any point", () => {
    const viewport: Viewport = { scale: 0.37, centerX: -120, centerY: 44 };
    const world = screenToWorld(viewport, WIDTH, HEIGHT, 123, 456);
    const screen = worldToScreen(viewport, WIDTH, HEIGHT, world.x, world.y);
    expect(screen.x).toBeCloseTo(123, 8);
    expect(screen.y).toBeCloseTo(456, 8);
  });

  it("scales distances by the zoom level", () => {
    const a = worldToScreen({ scale: 3, centerX: 0, centerY: 0 }, WIDTH, HEIGHT, 0, 0);
    const b = worldToScreen({ scale: 3, centerX: 0, centerY: 0 }, WIDTH, HEIGHT, 10, 0);
    expect(b.x - a.x).toBe(30);
  });
});

describe("fitToNodes", () => {
  it("centres on the middle of the graph", () => {
    const viewport = fitToNodes([node("a", 0, 0), node("b", 100, 50)], WIDTH, HEIGHT);
    expect(viewport.centerX).toBeCloseTo(50, 6);
    expect(viewport.centerY).toBeCloseTo(25, 6);
  });

  it("brings a graph larger than the canvas fully into view", () => {
    const nodes = [node("a", -5000, -5000), node("b", 5000, 5000)];
    const viewport = fitToNodes(nodes, WIDTH, HEIGHT);
    for (const n of nodes) {
      const screen = worldToScreen(viewport, WIDTH, HEIGHT, n.x, n.y);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(WIDTH);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it("magnifies a small graph, but only so far", () => {
    // Ten world units across in an 800px canvas: without a cap this would
    // zoom to ~70x and show two enormous circles.
    const viewport = fitToNodes([node("a", -5, 0), node("b", 5, 0)], WIDTH, HEIGHT);
    expect(viewport.scale).toBeGreaterThan(1);
    expect(viewport.scale).toBeLessThanOrEqual(2.2);
  });

  it("survives a canvas with no size yet", () => {
    const viewport = fitToNodes([node("a", 0, 0), node("b", 10, 10)], 0, 0);
    expect(Number.isFinite(viewport.scale)).toBe(true);
    expect(viewport.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("survives an empty graph", () => {
    const viewport = fitToNodes([], WIDTH, HEIGHT);
    expect(Number.isFinite(viewport.scale)).toBe(true);
    expect(Number.isFinite(viewport.centerX)).toBe(true);
  });
});

describe("zoomAt", () => {
  it("holds the world point under the pointer still", () => {
    const before = screenToWorld(CENTERED, WIDTH, HEIGHT, 200, 150);
    const zoomed = zoomAt(CENTERED, WIDTH, HEIGHT, 200, 150, 1.8);
    const after = screenToWorld(zoomed, WIDTH, HEIGHT, 200, 150);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("zooms in and out", () => {
    expect(zoomAt(CENTERED, WIDTH, HEIGHT, 400, 300, 2).scale).toBe(2);
    expect(zoomAt(CENTERED, WIDTH, HEIGHT, 400, 300, 0.5).scale).toBe(0.5);
  });

  it("clamps at the limits without drifting the centre", () => {
    const atMax: Viewport = { scale: MAX_SCALE, centerX: 12, centerY: -8 };
    expect(zoomAt(atMax, WIDTH, HEIGHT, 100, 100, 2)).toEqual(atMax);
    const atMin: Viewport = { scale: MIN_SCALE, centerX: 12, centerY: -8 };
    expect(zoomAt(atMin, WIDTH, HEIGHT, 100, 100, 0.5)).toEqual(atMin);
  });
});

describe("nodeAtScreenPoint", () => {
  const nodes = [node("a", 0, 0, 10), node("b", 200, 0, 10)];

  it("finds the node under the point", () => {
    const found = nodeAtScreenPoint(nodes, CENTERED, WIDTH, HEIGHT, WIDTH / 2, HEIGHT / 2);
    expect(found?.path).toBe("a");
  });

  it("returns null on empty space", () => {
    expect(nodeAtScreenPoint(nodes, CENTERED, WIDTH, HEIGHT, 10, 10)).toBeNull();
  });

  it("respects the node radius", () => {
    const edgeOfCircle = nodeAtScreenPoint(nodes, CENTERED, WIDTH, HEIGHT, WIDTH / 2 + 9, HEIGHT / 2);
    const pastIt = nodeAtScreenPoint(nodes, CENTERED, WIDTH, HEIGHT, WIDTH / 2 + 40, HEIGHT / 2);
    expect(edgeOfCircle?.path).toBe("a");
    expect(pastIt).toBeNull();
  });

  it("keeps a node clickable when zoomed far out", () => {
    // At this zoom the node's own radius is well under a pixel, so only the
    // hit-radius floor makes it possible to click at all.
    const tiny: Viewport = { scale: 0.05, centerX: 0, centerY: 0 };
    const lone = [node("a", 0, 0, 10)];
    expect(nodeAtScreenPoint(lone, tiny, WIDTH, HEIGHT, WIDTH / 2 + 4, HEIGHT / 2)?.path).toBe("a");
    expect(nodeAtScreenPoint(lone, tiny, WIDTH, HEIGHT, WIDTH / 2 + 20, HEIGHT / 2)).toBeNull();
  });

  it("prefers the node drawn on top when two overlap", () => {
    const stacked = [node("under", 0, 0, 10), node("over", 0, 0, 10)];
    expect(nodeAtScreenPoint(stacked, CENTERED, WIDTH, HEIGHT, WIDTH / 2, HEIGHT / 2)?.path).toBe("over");
  });
});

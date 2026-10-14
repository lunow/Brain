import { describe, expect, it } from "vitest";
import { Simulation, graphBounds, radiusForDegree } from "./forceSimulation";
import type { NoteGraph } from "./noteGraph";

function graph(paths: string[], edges: [string, string][], degrees: Record<string, number> = {}): NoteGraph {
  return {
    nodes: paths.map((path) => ({ path, name: path, degree: degrees[path] ?? 0 })),
    edges: edges.map(([source, target]) => ({ source, target })),
    unresolvedCount: 0,
  };
}

function runToSettled(sim: Simulation, limit = 1000): number {
  let ticks = 0;
  while (sim.tick() && ticks < limit) ticks++;
  return ticks;
}

function distance(sim: Simulation, a: string, b: string): number {
  const na = sim.node(a)!;
  const nb = sim.node(b)!;
  return Math.hypot(na.x - nb.x, na.y - nb.y);
}

describe("radiusForDegree", () => {
  it("grows with degree but sub-linearly, so a hub can't swallow the view", () => {
    const r0 = radiusForDegree(0);
    const r4 = radiusForDegree(4);
    const r16 = radiusForDegree(16);
    expect(r4).toBeGreaterThan(r0);
    expect(r16).toBeGreaterThan(r4);
    expect(r16 - r4).toBeLessThan(r4 - r0 + (r4 - r0));
  });
});

describe("Simulation", () => {
  it("seeds deterministically: two runs over the same graph match", () => {
    const g = graph(["a", "b", "c"], [["a", "b"]]);
    const first = new Simulation(g);
    const second = new Simulation(g);
    runToSettled(first);
    runToSettled(second);
    for (const path of ["a", "b", "c"]) {
      expect(first.node(path)!.x).toBeCloseTo(second.node(path)!.x, 10);
      expect(first.node(path)!.y).toBeCloseTo(second.node(path)!.y, 10);
    }
  });

  it("seeds every node at a distinct position", () => {
    const sim = new Simulation(graph(["a", "b", "c", "d", "e"], []));
    const seen = new Set(sim.nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(5);
  });

  it("settles, and stops reporting work once it has", () => {
    const sim = new Simulation(graph(["a", "b", "c"], [["a", "b"]]));
    const ticks = runToSettled(sim);
    expect(ticks).toBeLessThan(1000);
    expect(sim.settled).toBe(true);
    expect(sim.tick()).toBe(false);
  });

  it("pulls linked notes closer than unlinked ones", () => {
    const sim = new Simulation(graph(["a", "b", "c"], [["a", "b"]]));
    runToSettled(sim);
    expect(distance(sim, "a", "b")).toBeLessThan(distance(sim, "a", "c"));
    expect(distance(sim, "a", "b")).toBeLessThan(distance(sim, "b", "c"));
  });

  it("separates two notes that start stacked on the same point", () => {
    const sim = new Simulation(graph(["a", "b"], []));
    sim.node("a")!.x = 0;
    sim.node("a")!.y = 0;
    sim.node("b")!.x = 0;
    sim.node("b")!.y = 0;
    runToSettled(sim);
    for (const node of sim.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(distance(sim, "a", "b")).toBeGreaterThan(0);
  });

  it("keeps a disconnected note from drifting away", () => {
    const sim = new Simulation(graph(["a", "b", "c", "lonely"], [["a", "b"], ["b", "c"]]));
    sim.node("lonely")!.x = 8000;
    sim.node("lonely")!.y = 8000;
    sim.reheat(1);
    runToSettled(sim);
    expect(Math.hypot(sim.node("lonely")!.x, sim.node("lonely")!.y)).toBeLessThan(8000);
  });

  it("holds a fixed node in place while the rest moves", () => {
    const sim = new Simulation(graph(["a", "b", "c"], [["a", "b"], ["b", "c"]]));
    const pinned = sim.node("a")!;
    pinned.fixed = true;
    pinned.x = 100;
    pinned.y = -50;
    const movedBefore = { x: sim.node("c")!.x, y: sim.node("c")!.y };
    runToSettled(sim);
    expect(pinned.x).toBe(100);
    expect(pinned.y).toBe(-50);
    expect(sim.node("c")!.x === movedBefore.x && sim.node("c")!.y === movedBefore.y).toBe(false);
  });

  it("reheat restarts a settled layout", () => {
    const sim = new Simulation(graph(["a", "b"], [["a", "b"]]));
    runToSettled(sim);
    expect(sim.tick()).toBe(false);
    sim.reheat();
    expect(sim.tick()).toBe(true);
  });

  it("drops edges naming a note that isn't in the graph", () => {
    const sim = new Simulation(graph(["a"], [["a", "ghost"]]));
    expect(sim.edges).toHaveLength(0);
    expect(() => runToSettled(sim)).not.toThrow();
  });

  it("gives hubs a bigger radius than leaves", () => {
    const sim = new Simulation(graph(["hub", "leaf"], [], { hub: 9, leaf: 0 }));
    expect(sim.node("hub")!.radius).toBeGreaterThan(sim.node("leaf")!.radius);
  });

  it("adopts an earlier run's positions for the nodes it still has", () => {
    const first = new Simulation(graph(["a", "b", "c"], [["a", "b"]]));
    runToSettled(first);

    const rebuilt = new Simulation(graph(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]));
    expect(rebuilt.adoptPositions(first)).toBe(true);
    for (const path of ["a", "b", "c"]) {
      expect(rebuilt.node(path)!.x).toBe(first.node(path)!.x);
      expect(rebuilt.node(path)!.y).toBe(first.node(path)!.y);
    }
    // The new note keeps its seeded spot, and the layout restarts warm rather
    // than at full heat so the arrangement isn't thrown away.
    expect(rebuilt.node("d")!.x).toBe(new Simulation(graph(["a", "b", "c", "d"], [])).node("d")!.x);
    expect(rebuilt.alpha).toBeLessThan(1);
    expect(rebuilt.settled).toBe(false);
  });

  it("lays out from scratch when a rebuilt graph shares nothing", () => {
    const first = new Simulation(graph(["a", "b"], [["a", "b"]]));
    runToSettled(first);

    const other = new Simulation(graph(["x", "y"], []));
    const seeded = { x: other.node("x")!.x, y: other.node("x")!.y };
    expect(other.adoptPositions(first)).toBe(false);
    expect(other.node("x")!.x).toBe(seeded.x);
    expect(other.node("x")!.y).toBe(seeded.y);
    expect(other.alpha).toBe(1);
  });

  it("stays finite on a large graph", () => {
    const paths = Array.from({ length: 300 }, (_, i) => `n${i}`);
    const edges = paths.slice(1).map((p, i) => [paths[i], p] as [string, string]);
    const sim = new Simulation(graph(paths, edges));
    runToSettled(sim);
    for (const node of sim.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});

describe("graphBounds", () => {
  it("covers every node including its radius", () => {
    const sim = new Simulation(graph(["a", "b", "c"], []));
    const bounds = graphBounds(sim.nodes);
    for (const node of sim.nodes) {
      expect(node.x - node.radius).toBeGreaterThanOrEqual(bounds.minX);
      expect(node.x + node.radius).toBeLessThanOrEqual(bounds.maxX);
      expect(node.y - node.radius).toBeGreaterThanOrEqual(bounds.minY);
      expect(node.y + node.radius).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it("returns a non-degenerate box for an empty graph", () => {
    const bounds = graphBounds([]);
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });
});

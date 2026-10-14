import type { NoteGraph } from "./noteGraph";

/**
 * The force-directed layout behind the graph view.
 *
 * Three forces, run to a cooling schedule the way every spring layout does:
 * linked notes pull together, every note pushes its neighbours away, and a
 * weak pull towards the origin keeps disconnected islands from drifting off
 * screen. The result is positions, not pixels — panning, zoom and drawing
 * are the view's job, which keeps this pure and testable.
 *
 * Written by hand rather than pulled from d3-force: the app has no d3
 * dependency, and what's needed here is three forces and a grid, not the
 * dozen d3-force ships.
 */

export interface SimNode {
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Drawn radius, from the note's degree. Also the collision distance. */
  radius: number;
  /** Set while the node is being dragged: position is held, forces ignored. */
  fixed: boolean;
}

export interface SimEdge {
  source: SimNode;
  target: SimNode;
}

export interface SimConfig {
  /** How hard nodes push each other apart. */
  repulsion: number;
  /** Rest length of an edge's spring. */
  linkDistance: number;
  /** How stiff that spring is, 0–1. */
  linkStrength: number;
  /** Pull towards the origin, which anchors the whole layout. */
  centerStrength: number;
  /** Velocity retained per tick. Below 1 so the layout settles. */
  damping: number;
  /** Repulsion is only computed within this distance, which is what keeps a
   *  big vault from costing a full n² pairs per tick. Beyond it the force is
   *  small enough to drop: at 160 it is 6000/160² ≈ 0.23, against ~93 at the
   *  near-collision clamp and ~1.2 at an edge's rest length. */
  repulsionCutoff: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  repulsion: 6000,
  linkDistance: 70,
  linkStrength: 0.08,
  centerStrength: 0.012,
  damping: 0.82,
  repulsionCutoff: 160,
};

/** Alpha starts here and decays geometrically towards zero; once it drops
 *  below ALPHA_MIN the layout is settled and ticking stops. Mirrors
 *  d3-force's schedule — the decay has to target zero rather than ALPHA_MIN,
 *  or it approaches that floor asymptotically and never crosses it. */
const ALPHA_START = 1;
const ALPHA_DECAY = 0.0228;
const ALPHA_MIN = 0.005;
const MAX_VELOCITY = 40;

/** Heat a layout restarts at when it inherits an earlier run's positions:
 *  enough to absorb what changed, not enough to rearrange the whole graph. */
const ADOPT_ALPHA = 0.3;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Half the grid neighbourhood: each offset's opposite is deliberately
 *  missing, so a pair of neighbouring cells meets once rather than twice. */
const HALF_NEIGHBOURS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
];

export function radiusForDegree(degree: number): number {
  // Square root, so a note with 16 links reads as bigger than one with 4
  // without a hub swallowing the screen.
  return 4 + Math.sqrt(degree) * 2.6;
}

/**
 * Phyllotaxis spiral — the same deterministic seeding d3-force uses. Two runs
 * over the same graph produce the same layout, which makes the simulation
 * testable and keeps the view from reshuffling on every remount.
 */
function seedPosition(index: number): { x: number; y: number } {
  const radius = 12 * Math.sqrt(0.5 + index);
  const angle = index * GOLDEN_ANGLE;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export class Simulation {
  readonly nodes: SimNode[];
  readonly edges: SimEdge[];
  readonly config: SimConfig;
  alpha = ALPHA_START;

  private byPath = new Map<string, SimNode>();

  constructor(graph: NoteGraph, config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.nodes = graph.nodes.map((node, i) => {
      const { x, y } = seedPosition(i);
      return { path: node.path, x, y, vx: 0, vy: 0, radius: radiusForDegree(node.degree), fixed: false };
    });
    for (const node of this.nodes) this.byPath.set(node.path, node);

    this.edges = graph.edges
      .map((edge) => ({ source: this.byPath.get(edge.source), target: this.byPath.get(edge.target) }))
      .filter((e): e is SimEdge => e.source !== undefined && e.target !== undefined);
  }

  node(path: string): SimNode | undefined {
    return this.byPath.get(path);
  }

  /** Nudges the layout back to life — after a drag, or when the user asks for
   *  a re-run. */
  reheat(to = 0.35) {
    this.alpha = Math.max(this.alpha, to);
  }

  /**
   * Takes over the positions of an earlier run for every node both have, and
   * starts warm rather than at full heat.
   *
   * A rebuilt graph (a note added, a link edited — anything that changes the
   * structure the view was built from) would otherwise start from the seeded
   * spiral again and throw away an arrangement the user may have spent time
   * on. Nodes this run doesn't share with the old one keep their seeded
   * position and get pulled into place by the warm run. Returns false, and
   * changes nothing, when there is nothing in common: a different vault
   * deserves a layout from scratch.
   */
  adoptPositions(previous: Simulation, alpha = ADOPT_ALPHA): boolean {
    let adopted = 0;
    for (const node of this.nodes) {
      const old = previous.node(node.path);
      if (!old) continue;
      node.x = old.x;
      node.y = old.y;
      adopted++;
    }
    if (adopted === 0) return false;
    this.alpha = alpha;
    return true;
  }

  get settled(): boolean {
    return this.alpha < ALPHA_MIN;
  }

  /**
   * Advances the layout one step. Returns false once settled, so the view's
   * animation loop can stop drawing instead of burning a core on a static
   * picture.
   */
  tick(): boolean {
    if (this.settled) return false;
    this.alpha *= 1 - ALPHA_DECAY;

    this.applyRepulsion();
    this.applyLinks();
    this.applyCentering();
    this.integrate();

    return !this.settled;
  }

  /**
   * Pairwise repulsion, limited to nodes within `repulsionCutoff` of each
   * other and found through a uniform grid of cutoff-sized cells. Every pair
   * close enough to matter shares a cell or borders one, so checking a cell
   * and its eight neighbours finds them all while leaving the far-apart
   * majority untouched.
   *
   * Repulsion is symmetric, so each pair is computed once and applied to
   * both ends: within a cell only the pairs above the diagonal, and only
   * four of the eight neighbouring cells — the other four reach this cell
   * from their own side, so every pair is still seen exactly once.
   *
   * That bounds the work to nearby nodes; it is not linear in node count.
   * The centering force pulls the layout tighter as the graph grows, so cell
   * occupancy rises with it and the measured cost goes as roughly n^1.6.
   * Keeping the cutoff only as wide as the force needs is what keeps the
   * constant small. Measured over one settle of a 5000-note vault: the
   * original one-sided walk at a cutoff of 320 cost ~40ms per tick (≈9s of
   * pinned UI thread, since the view ticks and redraws once per frame);
   * halving the pairs and narrowing the cutoff to 160 brings it to ~6ms.
   */
  private applyRepulsion() {
    const { repulsion, repulsionCutoff } = this.config;
    const cutoffSq = repulsionCutoff * repulsionCutoff;

    const cells = new Map<string, SimNode[]>();
    const cellOf = (v: number) => Math.floor(v / repulsionCutoff);
    const cellKey = (gx: number, gy: number) => `${gx},${gy}`;
    // Kept alongside the map so the pair walk below can iterate the occupied
    // cells and still know each one's coordinates without parsing its key.
    const occupied: { gx: number; gy: number; nodes: SimNode[] }[] = [];
    for (const node of this.nodes) {
      const gx = cellOf(node.x);
      const gy = cellOf(node.y);
      const bucket = cells.get(cellKey(gx, gy));
      if (bucket) {
        bucket.push(node);
      } else {
        const created = [node];
        cells.set(cellKey(gx, gy), created);
        occupied.push({ gx, gy, nodes: created });
      }
    }

    /** Pushes one pair apart, both ends at once. */
    const separate = (node: SimNode, other: SimNode) => {
      let dx = node.x - other.x;
      let dy = node.y - other.y;
      let distSq = dx * dx + dy * dy;
      if (distSq > cutoffSq) return;

      // Two nodes at the exact same point have no direction to separate
      // along; nudge them apart deterministically instead of dividing
      // by zero. Seeded positions are distinct, but a drag can stack
      // them.
      if (distSq === 0) {
        dx = (node.path < other.path ? 1 : -1) * 0.5;
        dy = 0.5;
        distSq = 0.5;
      }

      const dist = Math.sqrt(distSq);
      // Clamped so a near-collision doesn't fling nodes across the view.
      const force = repulsion / Math.max(distSq, 64);
      const fx = (dx / dist) * force * this.alpha;
      const fy = (dy / dist) * force * this.alpha;
      node.vx += fx;
      node.vy += fy;
      other.vx -= fx;
      other.vy -= fy;
    };

    for (const cell of occupied) {
      const { nodes } = cell;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) separate(nodes[i], nodes[j]);
      }
      for (const [dgx, dgy] of HALF_NEIGHBOURS) {
        const bucket = cells.get(cellKey(cell.gx + dgx, cell.gy + dgy));
        if (!bucket) continue;
        for (const node of nodes) {
          for (const other of bucket) separate(node, other);
        }
      }
    }
  }

  private applyLinks() {
    const { linkDistance, linkStrength } = this.config;
    for (const edge of this.edges) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      // Hooke's law on the spring's extension, split evenly between the ends.
      const force = (dist - linkDistance) * linkStrength * this.alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      edge.source.vx += fx;
      edge.source.vy += fy;
      edge.target.vx -= fx;
      edge.target.vy -= fy;
    }
  }

  private applyCentering() {
    const { centerStrength } = this.config;
    for (const node of this.nodes) {
      node.vx -= node.x * centerStrength * this.alpha;
      node.vy -= node.y * centerStrength * this.alpha;
    }
  }

  private integrate() {
    const { damping } = this.config;
    for (const node of this.nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      // A velocity ceiling keeps a dense cluster from exploding on the first
      // few hot ticks, when alpha is still 1.
      node.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, node.vx * damping));
      node.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, node.vy * damping));
      node.x += node.vx;
      node.y += node.vy;
    }
  }
}

/** Bounding box of the laid-out nodes, radii included — what the view needs
 *  to fit the whole graph on screen. */
export function graphBounds(nodes: SimNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  return { minX, minY, maxX, maxY };
}

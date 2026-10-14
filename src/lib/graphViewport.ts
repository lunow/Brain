import type { SimNode } from "./forceSimulation";
import { graphBounds } from "./forceSimulation";

/**
 * The pan/zoom transform between the simulation's own coordinates and the
 * canvas. Kept apart from the drawing code so the arithmetic that decides
 * what's under the pointer is testable without a canvas.
 */

export interface Viewport {
  /** Canvas pixels per world unit. */
  scale: number;
  /** World point drawn at the centre of the canvas. */
  centerX: number;
  centerY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 6;

/** Padding left around the graph when fitting it to the canvas. */
const FIT_PADDING = 48;

/** How far a fit may magnify a graph smaller than the canvas. Some zoom-in
 *  keeps a handful of notes from sitting as a small clump in a large empty
 *  pane; too much and they read as balloons, so it stops well short of what
 *  the user can reach by hand. */
const MAX_FIT_SCALE = 2.2;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function worldToScreen(
  viewport: Viewport,
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - viewport.centerX) * viewport.scale + width / 2,
    y: (y - viewport.centerY) * viewport.scale + height / 2,
  };
}

export function screenToWorld(
  viewport: Viewport,
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - width / 2) / viewport.scale + viewport.centerX,
    y: (y - height / 2) / viewport.scale + viewport.centerY,
  };
}

/** A viewport showing the whole graph, centred, with a little air around it. */
export function fitToNodes(nodes: SimNode[], width: number, height: number): Viewport {
  const bounds = graphBounds(nodes);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;

  // An unfit canvas (zero width or height before the first layout pass) would
  // otherwise divide its way to Infinity.
  const usableWidth = Math.max(width - FIT_PADDING * 2, 1);
  const usableHeight = Math.max(height - FIT_PADDING * 2, 1);

  const scale = clampScale(
    Math.min(usableWidth / Math.max(spanX, 1), usableHeight / Math.max(spanY, 1), MAX_FIT_SCALE),
  );

  return {
    scale,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
  };
}

/**
 * Zooms by `factor` while holding the world point under the pointer still —
 * what makes wheel-zoom feel like it's anchored to the cursor rather than to
 * the middle of the view.
 */
export function zoomAt(
  viewport: Viewport,
  width: number,
  height: number,
  screenX: number,
  screenY: number,
  factor: number,
): Viewport {
  const scale = clampScale(viewport.scale * factor);
  // Clamped away at the limits, so don't drift the centre on a no-op zoom.
  if (scale === viewport.scale) return viewport;

  const anchor = screenToWorld(viewport, width, height, screenX, screenY);
  const next = { scale, centerX: viewport.centerX, centerY: viewport.centerY };
  const after = screenToWorld(next, width, height, screenX, screenY);
  return {
    scale,
    centerX: viewport.centerX + (anchor.x - after.x),
    centerY: viewport.centerY + (anchor.y - after.y),
  };
}

/**
 * Topmost node whose circle contains a screen point, or null. Searched back
 * to front so the result matches what's drawn on top; the hit radius has a
 * floor so a leaf node stays clickable when zoomed out.
 */
export function nodeAtScreenPoint(
  nodes: SimNode[],
  viewport: Viewport,
  width: number,
  height: number,
  screenX: number,
  screenY: number,
): SimNode | null {
  const MIN_HIT_RADIUS = 6;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const screen = worldToScreen(viewport, width, height, node.x, node.y);
    const hit = Math.max(node.radius * viewport.scale, MIN_HIT_RADIUS);
    const dx = screenX - screen.x;
    const dy = screenY - screen.y;
    if (dx * dx + dy * dy <= hit * hit) return node;
  }
  return null;
}

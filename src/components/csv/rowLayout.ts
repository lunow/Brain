/**
 * Vertical row geometry for the CSV table.
 *
 * Without word wrap every row is the same height and positions are plain
 * arithmetic. With wrap, rows grow to fit their tallest cell, so the table
 * keeps a prefix-sum of heights instead: estimated for every row up front
 * from character counts (cheap enough for 100k rows), then corrected with
 * real DOM measurements for the rows actually on screen.
 */

export const ROW_HEIGHT = 30;
/** Cell text metrics, mirrored in CsvTable.module.css (.cell / .cellText). */
export const CELL_PAD_TOP = 6;
export const CELL_PAD_BOTTOM = 6;
export const LINE_HEIGHT = 18;

export interface RowLayout {
  readonly count: number;
  /** Height of all rows together. */
  readonly total: number;
  top(row: number): number;
  height(row: number): number;
  /** The row covering vertical offset `y` (clamped to the table). */
  rowAt(y: number): number;
}

export function uniformLayout(count: number): RowLayout {
  return {
    count,
    total: count * ROW_HEIGHT,
    top: (row) => row * ROW_HEIGHT,
    height: () => ROW_HEIGHT,
    rowAt: (y) => Math.max(0, Math.min(count - 1, Math.floor(y / ROW_HEIGHT))),
  };
}

export function variableLayout(heights: Float64Array): RowLayout {
  const count = heights.length;
  const offsets = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + heights[i];
  return {
    count,
    total: offsets[count],
    top: (row) => offsets[Math.max(0, Math.min(count, row))],
    height: (row) => heights[row] ?? ROW_HEIGHT,
    rowAt: (y) => {
      let lo = 0;
      let hi = count - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return Math.max(0, lo);
    },
  };
}

export function heightForLines(lines: number): number {
  return Math.max(ROW_HEIGHT, CELL_PAD_TOP + CELL_PAD_BOTTOM + lines * LINE_HEIGHT);
}

/** Lines a value takes when wrapped into `charsPerLine`, honoring its own
 *  line breaks. An estimate: real wrapping breaks at word boundaries. */
export function estimateLines(value: string, charsPerLine: number): number {
  if (value.length <= charsPerLine && !value.includes("\n")) return 1;
  let lines = 0;
  let start = 0;
  for (;;) {
    const nl = value.indexOf("\n", start);
    const len = (nl === -1 ? value.length : nl) - start;
    lines += Math.max(1, Math.ceil(len / charsPerLine));
    if (nl === -1) return lines;
    start = nl + 1;
  }
}

/**
 * Estimated wrapped height of every row, in display order. `getRow` returns
 * the cells of the row shown at a display index; `contentWidths` are the
 * columns' widths minus cell padding.
 */
export function estimateRowHeights(
  count: number,
  getRow: (displayRow: number) => readonly string[],
  contentWidths: number[],
  charWidth: number,
): Float64Array {
  const charsPerLine = contentWidths.map((w) => Math.max(1, Math.floor(w / charWidth)));
  const heights = new Float64Array(count);
  for (let r = 0; r < count; r++) {
    const row = getRow(r);
    let lines = 1;
    for (let c = 0; c < row.length && c < charsPerLine.length; c++) {
      const v = row[c];
      if (!v) continue;
      const n = estimateLines(v, charsPerLine[c]);
      if (n > lines) lines = n;
    }
    heights[r] = heightForLines(lines);
  }
  return heights;
}

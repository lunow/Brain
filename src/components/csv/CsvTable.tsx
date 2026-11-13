import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CsvModel, parseClipboardBlock, type SortDirection } from "@/lib/csv";
import { ContextMenu, type ContextMenuEntry } from "@/components/common/ContextMenu";
import { useCsvPrefs } from "./csvPrefs";
import { RowSheet } from "./RowSheet";
import {
  CELL_PAD_BOTTOM,
  CELL_PAD_TOP,
  ROW_HEIGHT,
  estimateRowHeights,
  uniformLayout,
  variableLayout,
  type RowLayout,
} from "./rowLayout";
import styles from "./CsvTable.module.css";

/* Geometry. Rows are a fixed height unless word wrap is on — see
   rowLayout.ts for how variable heights stay fast. */
const HEADER_HEIGHT = 34;
const OVERSCAN_ROWS = 8;
const OVERSCAN_PX = 200;
const MIN_COL_WIDTH = 56;
const MAX_AUTO_COL_WIDTH = 320;
const CELL_PAD_X = 10;
const WIDTH_SAMPLE_ROWS = 400;
const EMPTY_MEASURED = new Map<number, number>();

interface Cursor {
  row: number; // -1 = header
  col: number;
}

interface EditState extends Cursor {
  value: string;
}

interface CsvTableProps {
  model: CsvModel;
  /** Changes whenever the model has been mutated, to re-render. */
  version: number;
  /** Called after every edit to the model. */
  onChange: () => void;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Which rows to look at when guessing column widths and types: the first
 *  stretch in full, then an even spread to the end — the tail is where ids
 *  and totals get widest. */
function sampleRows(rowCount: number): number[] {
  if (rowCount <= WIDTH_SAMPLE_ROWS) return Array.from({ length: rowCount }, (_, i) => i);
  const head = WIDTH_SAMPLE_ROWS / 2;
  const rows = Array.from({ length: head }, (_, i) => i);
  const step = (rowCount - head) / head;
  for (let i = 1; i <= head; i++) rows.push(Math.min(rowCount - 1, Math.round(head - 1 + i * step)));
  return rows;
}

/** Initial column widths from the header and a sample of rows — enough to
 *  look right without measuring 100k cells. */
function autoWidths(model: CsvModel, bodyFont: string, headerFont: string): number[] {
  const widths: number[] = [];
  const sample = sampleRows(model.rowCount);
  for (let c = 0; c < model.columnCount; c++) {
    // Room for the sort affordance next to the header label.
    let w = textWidth(model.getCell(-1, c) || "Column 00", headerFont) + 22;
    for (const r of sample) {
      const v = model.rows[r][c];
      if (v) w = Math.max(w, textWidth(v.length > 80 ? v.slice(0, 80) : v, bodyFont));
      if (w >= MAX_AUTO_COL_WIDTH) break;
    }
    // + border and a little slack, since canvas and DOM text widths can
    // differ by a subpixel and an ellipsis on fully-fitting text looks broken.
    widths.push(Math.ceil(Math.min(MAX_AUTO_COL_WIDTH, Math.max(MIN_COL_WIDTH, w + 2 * CELL_PAD_X + 4))));
  }
  return widths;
}

/** Columns whose sampled values are all numbers read better right-aligned. */
function numericColumns(model: CsvModel): boolean[] {
  const sample = sampleRows(model.rowCount);
  const result: boolean[] = [];
  for (let c = 0; c < model.columnCount; c++) {
    let seen = false;
    let numeric = true;
    for (let i = 0; i < sample.length && numeric; i++) {
      const v = model.rows[sample[i]][c]?.trim();
      if (!v) continue;
      seen = true;
      numeric = Number.isFinite(Number(v));
    }
    result.push(seen && numeric);
  }
  return result;
}

/** Largest index i with offsets[i] <= x. */
function findIndex(offsets: number[], x: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function CsvTable({ model, version, onChange }: CsvTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sinkRef = useRef<HTMLTextAreaElement>(null);
  const [viewport, setViewport] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [widths, setWidths] = useState<number[]>([]);
  const [focused, setFocused] = useState(false);
  /** Display row open in the ⌘↵ row sheet, if any. */
  const [sheetRow, setSheetRow] = useState<number | null>(null);
  const wrap = useCsvPrefs((s) => s.wrap);
  const toggleWrap = useCsvPrefs((s) => s.toggleWrap);

  const rowCount = model.rowCount;
  const colCount = model.columnCount;

  // Fonts come from the stylesheet, so measuring matches what's drawn.
  const fonts = useMemo(() => {
    const probe = scrollRef.current ?? document.body;
    const family = getComputedStyle(probe).getPropertyValue("--font-sans").trim() || "sans-serif";
    return {
      body: `13px ${family}`,
      header: `600 12px ${family}`,
      // Average glyph width of ordinary text, for estimating wrapped heights.
      charWidth: textWidth("The quick brown fox jumps over the lazy dog 0123456789", `13px ${family}`) / 54,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute widths for a new file, or when the column set changes shape.
  // A drag-resized width survives ordinary edits but not inserting/removing
  // columns, where indices shift.
  useLayoutEffect(() => {
    setWidths(autoWidths(model, fonts.body, fonts.header));
  }, [model, colCount, fonts]);

  const numeric = useMemo(() => numericColumns(model), [model, colCount]);

  const gutterWidth = useMemo(() => Math.max(44, String(rowCount).length * 8 + 24), [rowCount]);

  const colOffsets = useMemo(() => {
    const offsets = [0];
    for (let c = 0; c < colCount; c++) offsets.push(offsets[c] + (widths[c] ?? 120));
    return offsets;
  }, [widths, colCount]);
  const totalWidth = gutterWidth + colOffsets[colCount];

  /* --- Row layout --------------------------------------------------- */

  const sortKey = model.sort ? `${model.sort.column}${model.sort.direction}` : "";

  // Wrapped heights: an estimate for every row, refined by measuring the
  // rows on screen. Measurements are by display index, so anything that
  // changes what's at an index (edits, sorting, widths) starts them over.
  const estimates = useMemo(() => {
    if (!wrap) return null;
    const contentWidths = colOffsets.slice(1).map((end, c) => end - colOffsets[c] - 2 * CELL_PAD_X - 1);
    return estimateRowHeights(rowCount, (r) => model.rows[model.modelIndex(r)], contentWidths, fonts.charWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap, model, version, sortKey, rowCount, colOffsets, fonts]);
  // Measurements belong to the estimates they refine; new estimates start
  // from none without a reset render.
  const [measuredState, setMeasuredState] = useState<{ source: Float64Array | null; map: Map<number, number> }>(
    () => ({ source: null, map: new Map() }),
  );
  const measured = measuredState.source === estimates ? measuredState.map : EMPTY_MEASURED;

  const layout: RowLayout = useMemo(() => {
    if (!estimates) return uniformLayout(rowCount);
    if (measured.size === 0) return variableLayout(estimates);
    const heights = estimates.slice();
    for (const [r, h] of measured) if (r < heights.length) heights[r] = h;
    return variableLayout(heights);
  }, [estimates, measured, rowCount]);

  const totalHeight = HEADER_HEIGHT + layout.total;

  // Keep the cursor inside the table after rows/columns disappear (deletes,
  // undo, a reload from disk).
  useEffect(() => {
    setCursor((c) => {
      const row = Math.min(c.row, rowCount - 1);
      const col = Math.min(c.col, colCount - 1);
      return row === c.row && col === c.col ? c : { row: Math.max(-1, row), col: Math.max(0, col) };
    });
  }, [rowCount, colCount]);

  /* --- Viewport tracking -------------------------------------------- */

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setViewport({ top: el.scrollTop, left: el.scrollLeft, width: el.clientWidth, height: el.clientHeight });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const firstRow = Math.max(0, layout.rowAt(viewport.top) - OVERSCAN_ROWS);
  const lastRow = Math.min(rowCount - 1, layout.rowAt(viewport.top + viewport.height) + OVERSCAN_ROWS);

  // Measure the wrapped rows on screen and fold real heights into the
  // layout. The row at the top of the viewport is pinned while heights
  // above it change, so the content doesn't jump under the reader.
  const anchor = useRef<{ row: number; offset: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !wrap) return;
    if (anchor.current) {
      el.scrollTop = layout.top(anchor.current.row) + anchor.current.offset;
      anchor.current = null;
    }
    let next: Map<number, number> | null = null;
    for (const rowEl of el.querySelectorAll<HTMLElement>("[data-row]")) {
      const r = Number(rowEl.dataset.row);
      let content = 0;
      for (const text of rowEl.querySelectorAll<HTMLElement>("[data-cell-text]")) {
        if (text.offsetHeight > content) content = text.offsetHeight;
      }
      const h = Math.max(ROW_HEIGHT, content + CELL_PAD_TOP + CELL_PAD_BOTTOM);
      if (Math.abs(h - layout.height(r)) > 0.5) {
        next ??= new Map(measured);
        next.set(r, h);
      }
    }
    if (next) {
      const top = layout.rowAt(el.scrollTop);
      anchor.current = { row: top, offset: el.scrollTop - layout.top(top) };
      setMeasuredState({ source: estimates, map: next });
    }
  });
  const firstCol = findIndex(colOffsets, Math.max(0, viewport.left - OVERSCAN_PX));
  const lastCol = Math.min(colCount - 1, findIndex(colOffsets, viewport.left + viewport.width + OVERSCAN_PX));

  const visibleCols = useMemo(() => {
    const cols: number[] = [];
    for (let c = firstCol; c <= lastCol; c++) cols.push(c);
    // The cell being edited stays mounted even when scrolled out of view.
    if (edit && (edit.col < firstCol || edit.col > lastCol)) cols.push(edit.col);
    return cols;
  }, [firstCol, lastCol, edit]);

  const visibleRows = useMemo(() => {
    const rows: number[] = [];
    for (let r = firstRow; r <= lastRow; r++) rows.push(r);
    if (edit && edit.row >= 0 && (edit.row < firstRow || edit.row > lastRow)) rows.push(edit.row);
    return rows;
  }, [firstRow, lastRow, edit]);

  /* --- Cursor movement ---------------------------------------------- */

  const focusSink = useCallback(() => {
    sinkRef.current?.focus({ preventScroll: true });
  }, []);

  /** Scrolls just enough to bring a cell clear of the sticky header and
   *  row-number gutter. */
  const revealCell = useCallback(
    (target: Cursor) => {
      const el = scrollRef.current;
      if (!el) return;
      if (target.row >= 0) {
        const top = layout.top(target.row);
        const bottom = top + layout.height(target.row);
        const viewHeight = el.clientHeight - HEADER_HEIGHT;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (bottom > el.scrollTop + viewHeight) el.scrollTop = Math.min(top, bottom - viewHeight);
      }
      const left = colOffsets[target.col];
      const right = colOffsets[target.col + 1];
      const viewWidth = el.clientWidth - gutterWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + viewWidth) el.scrollLeft = Math.min(left, right - viewWidth);
    },
    [colOffsets, gutterWidth, layout],
  );

  const moveTo = useCallback(
    (row: number, col: number) => {
      const next = {
        row: Math.max(-1, Math.min(rowCount - 1, row)),
        col: Math.max(0, Math.min(colCount - 1, col)),
      };
      setCursor(next);
      revealCell(next);
    },
    [rowCount, colCount, revealCell],
  );

  // The focus sink holds the active cell's text, selected, so the native
  // Copy/Cut/Paste commands are enabled and fire their events on it.
  const cursorValue = model.getCell(cursor.row, cursor.col);
  useEffect(() => {
    const sink = sinkRef.current;
    if (!sink) return;
    sink.value = cursorValue || " ";
    if (document.activeElement === sink) sink.select();
  }, [cursorValue, cursor, version]);

  /* --- Editing ------------------------------------------------------- */

  const startEdit = useCallback(
    (at: Cursor, initial?: string) => {
      revealCell(at);
      setEdit({ ...at, value: initial ?? model.getCell(at.row, at.col) });
    },
    [model, revealCell],
  );

  const commitEdit = useCallback(
    (state: EditState, move?: { dRow: number; dCol: number }) => {
      setEdit(null);
      if (model.getCell(state.row, state.col) !== state.value) {
        model.setCell(state.row, state.col, state.value);
        onChange();
      }
      if (move) moveTo(state.row + move.dRow, state.col + move.dCol);
      focusSink();
    },
    [model, onChange, moveTo, focusSink],
  );

  const cancelEdit = useCallback(() => {
    setEdit(null);
    focusSink();
  }, [focusSink]);

  /* --- Commands ------------------------------------------------------ */

  // A sort re-orders rows without an edit, so it needs its own re-render.
  const [, forceRender] = useState(0);

  const run = useCallback(
    (fn: () => void, after?: Cursor) => {
      fn();
      onChange();
      if (after) moveTo(after.row, after.col);
      // Context-menu actions: Radix is still closing and holding focus.
      requestAnimationFrame(focusSink);
    },
    [onChange, moveTo, focusSink],
  );

  const commands = useMemo(
    () => ({
      insertRowAbove: (c: Cursor) => run(() => model.insertRow(Math.max(0, c.row)), { row: Math.max(0, c.row), col: c.col }),
      insertRowBelow: (c: Cursor) => run(() => model.insertRow(c.row + 1), { row: c.row + 1, col: c.col }),
      deleteRow: (c: Cursor) => {
        if (c.row < 0 || rowCount === 0) return;
        run(() => model.deleteRow(c.row), { row: Math.min(c.row, rowCount - 2), col: c.col });
      },
      insertColumnLeft: (c: Cursor) => run(() => model.insertColumn(c.col), { row: -1, col: c.col }),
      insertColumnRight: (c: Cursor) => run(() => model.insertColumn(c.col + 1), { row: -1, col: c.col + 1 }),
      deleteColumn: (c: Cursor) => {
        if (colCount <= 1) return;
        run(() => model.deleteColumn(c.col), { row: c.row, col: Math.min(c.col, colCount - 2) });
      },
      sort: (col: number, direction: SortDirection | null) => {
        model.setSort(direction ? { column: col, direction } : null);
        // Sorting changes only the view, so it isn't an edit to save.
        forceRender((n) => n + 1);
        requestAnimationFrame(focusSink);
      },
      undo: () => {
        const at = model.undo();
        if (at) run(() => {}, at);
      },
      redo: () => {
        const at = model.redo();
        if (at) run(() => {}, at);
      },
    }),
    [model, run, rowCount, colCount, focusSink],
  );

  const cycleSort = useCallback(
    (col: number) => {
      const current = model.sort?.column === col ? model.sort.direction : null;
      commands.sort(col, current === null ? "asc" : current === "asc" ? "desc" : null);
    },
    [model, commands],
  );

  /* --- Keyboard ------------------------------------------------------ */

  function onSinkKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    const { row, col } = cursor;
    const viewHeight = (scrollRef.current?.clientHeight ?? 300) - HEADER_HEIGHT;
    const pageFrom = (r: number, dir: 1 | -1) =>
      layout.rowAt(layout.top(Math.max(0, r)) + dir * Math.max(ROW_HEIGHT, viewHeight - ROW_HEIGHT));
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (mod && e.key.toLowerCase() === "z") {
      handled();
      if (e.shiftKey) commands.redo();
      else commands.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      handled();
      commands.redo();
      return;
    }
    if (mod && e.key === "Enter") {
      handled();
      openSheet();
      return;
    }
    // ⌥Z, matching code editors. By code, since ⌥ changes the character.
    if (e.altKey && !mod && e.code === "KeyZ") {
      handled();
      toggleWrap();
      return;
    }
    // ⌥ + arrow inserts next to the cursor, as in Numbers.
    if (e.altKey && !mod && e.key.startsWith("Arrow")) {
      handled();
      if (e.key === "ArrowUp") commands.insertRowAbove(cursor);
      else if (e.key === "ArrowDown") commands.insertRowBelow(cursor);
      else if (e.key === "ArrowLeft") commands.insertColumnLeft(cursor);
      else commands.insertColumnRight(cursor);
      return;
    }
    if (mod && e.key === "Backspace") {
      handled();
      if (e.altKey) commands.deleteColumn(cursor);
      else commands.deleteRow(cursor);
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        handled();
        // ⌘↑ goes to the first row; one more ↑ reaches the header.
        moveTo(mod && row > 0 ? 0 : row - 1, col);
        return;
      case "ArrowDown":
        handled();
        moveTo(mod ? rowCount - 1 : row + 1, col);
        return;
      case "ArrowLeft":
        handled();
        moveTo(row, mod ? 0 : col - 1);
        return;
      case "ArrowRight":
        handled();
        moveTo(row, mod ? colCount - 1 : col + 1);
        return;
      case "Tab":
        handled();
        if (e.shiftKey) {
          if (col > 0) moveTo(row, col - 1);
          else if (row > -1) moveTo(row - 1, colCount - 1);
        } else if (col < colCount - 1) moveTo(row, col + 1);
        else if (row < rowCount - 1) moveTo(row + 1, 0);
        return;
      case "PageUp":
        handled();
        moveTo(pageFrom(row, -1), col);
        return;
      case "PageDown":
        handled();
        moveTo(pageFrom(row, 1), col);
        return;
      case "Home":
        handled();
        moveTo(mod ? 0 : row, 0);
        return;
      case "End":
        handled();
        moveTo(mod ? rowCount - 1 : row, colCount - 1);
        return;
      case "Enter":
      case "F2":
        handled();
        startEdit(cursor);
        return;
      case "Backspace":
      case "Delete":
        if (mod || e.altKey) return;
        handled();
        if (cursorValue !== "") run(() => model.setCell(row, col, ""));
        return;
    }

    // Typing starts an edit that replaces the cell, as in a spreadsheet.
    if (!mod && !e.altKey && e.key.length === 1) {
      handled();
      startEdit(cursor, e.key);
    }
  }

  function onCopy(e: React.ClipboardEvent) {
    e.preventDefault();
    e.clipboardData.setData("text/plain", cursorValue);
  }

  function onCut(e: React.ClipboardEvent) {
    onCopy(e);
    if (cursorValue !== "") run(() => model.setCell(cursor.row, cursor.col, ""));
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const block = parseClipboardBlock(text);
    run(() => model.pasteBlock(cursor.row, cursor.col, block));
  }

  /* --- Mouse --------------------------------------------------------- */

  // Cells aren't focusable, so a press on one would blur the grid; cells
  // cancel that default and hand focus to the sink themselves. That also
  // means an open editor never sees a blur, so it is committed here.
  const editRef = useRef(edit);
  editRef.current = edit;
  const onCellPointer = useCallback(
    (row: number, col: number, kind: "down" | "double" | "context") => {
      if (kind === "double") {
        startEdit({ row, col });
        return;
      }
      const open = editRef.current;
      if (open && (open.row !== row || open.col !== col)) commitEdit(open);
      setCursor({ row, col });
      if (kind === "down") focusSink();
    },
    [startEdit, commitEdit, focusSink],
  );

  const onResize = useCallback((col: number, width: number) => {
    setWidths((prev) => {
      const next = prev.slice();
      next[col] = Math.max(MIN_COL_WIDTH, Math.round(width));
      return next;
    });
  }, []);

  /* --- Row sheet --------------------------------------------------- */

  function openSheet(at: Cursor = cursor) {
    if (rowCount === 0) return;
    const row = Math.max(0, at.row);
    setCursor({ row, col: at.col });
    revealCell({ row, col: at.col });
    setSheetRow(row);
  }

  const commitFromSheet = useCallback(
    (row: number, col: number, value: string) => {
      model.setCell(row, col, value);
      onChange();
    },
    [model, onChange],
  );

  /* --- Context menu -------------------------------------------------- */

  const sortDir = model.sort?.column === cursor.col ? model.sort.direction : null;
  const menuItems: ContextMenuEntry[] = [
    ...(cursor.row >= 0
      ? ([
          { label: "Open Row", onSelect: () => openSheet(cursor) },
          "separator",
          { label: "Insert Row Above", onSelect: () => commands.insertRowAbove(cursor) },
          { label: "Insert Row Below", onSelect: () => commands.insertRowBelow(cursor) },
          { label: "Delete Row", onSelect: () => commands.deleteRow(cursor) },
          "separator",
        ] as ContextMenuEntry[])
      : ([
          { label: "Rename Column", onSelect: () => startEdit(cursor) },
          { label: "Insert Row at Top", onSelect: () => commands.insertRowAbove({ row: 0, col: cursor.col }) },
          "separator",
        ] as ContextMenuEntry[])),
    { label: "Insert Column Left", onSelect: () => commands.insertColumnLeft(cursor) },
    { label: "Insert Column Right", onSelect: () => commands.insertColumnRight(cursor) },
    ...(colCount > 1 ? [{ label: "Delete Column", onSelect: () => commands.deleteColumn(cursor) }] : []),
    "separator",
    ...(sortDir !== "asc" ? [{ label: "Sort Ascending", onSelect: () => commands.sort(cursor.col, "asc") }] : []),
    ...(sortDir !== "desc" ? [{ label: "Sort Descending", onSelect: () => commands.sort(cursor.col, "desc") }] : []),
    ...(model.sort ? [{ label: "Clear Sort", onSelect: () => commands.sort(0, null) }] : []),
    "separator",
    {
      label: wrap ? "Turn Off Word Wrap" : "Turn On Word Wrap",
      onSelect: () => {
        toggleWrap();
        requestAnimationFrame(focusSink);
      },
    },
  ];

  /* --- Render -------------------------------------------------------- */

  const sizerStyle: CSSProperties = { width: totalWidth, height: totalHeight };

  return (
    <div
      className={styles.root}
      data-focused={focused || edit !== null}
      data-wrap={wrap}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <textarea
        ref={sinkRef}
        className={styles.sink}
        aria-label="Table"
        // Not readOnly: WebKit disables the native Paste command on read-only
        // fields. Typing is intercepted in onKeyDown; anything else that slips
        // through (dictation, an IME) is undone here.
        onInput={(e) => {
          e.currentTarget.value = cursorValue || " ";
          e.currentTarget.select();
        }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        tabIndex={0}
        onKeyDown={onSinkKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onFocus={(e) => e.currentTarget.select()}
      />
      <ContextMenu items={menuItems}>
        <div ref={scrollRef} className={styles.scroller}>
          <div className={styles.sizer} style={sizerStyle}>
            <div className={styles.header} style={{ width: totalWidth, height: HEADER_HEIGHT }}>
              <div className={styles.corner} style={{ width: gutterWidth }} />
              {visibleCols.map((c) => (
                <HeaderCell
                  key={c}
                  col={c}
                  label={model.getCell(-1, c)}
                  left={gutterWidth + colOffsets[c]}
                  width={colOffsets[c + 1] - colOffsets[c]}
                  active={cursor.row === -1 && cursor.col === c}
                  inActiveCol={cursor.col === c}
                  numeric={numeric[c]}
                  sort={model.sort?.column === c ? model.sort.direction : null}
                  onPointer={onCellPointer}
                  onSort={cycleSort}
                  onResize={onResize}
                />
              ))}
              {edit?.row === -1 && (
                <CellEditor
                  state={edit}
                  left={gutterWidth + colOffsets[edit.col]}
                  top={0}
                  width={colOffsets[edit.col + 1] - colOffsets[edit.col]}
                  height={HEADER_HEIGHT}
                  onChange={(value) => setEdit({ ...edit, value })}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
              )}
            </div>
            {visibleRows.map((r) => (
              <TableRow
                key={r}
                row={r}
                model={model}
                version={version}
                sortKey={sortKey}
                top={HEADER_HEIGHT + layout.top(r)}
                height={layout.height(r)}
                wrap={wrap}
                cols={visibleCols}
                colOffsets={colOffsets}
                gutterWidth={gutterWidth}
                width={totalWidth}
                numeric={numeric}
                activeCol={cursor.row === r ? cursor.col : -1}
                onPointer={onCellPointer}
              />
            ))}
            {edit && edit.row >= 0 && (
              <CellEditor
                state={edit}
                left={gutterWidth + colOffsets[edit.col]}
                top={HEADER_HEIGHT + layout.top(edit.row)}
                width={colOffsets[edit.col + 1] - colOffsets[edit.col]}
                height={layout.height(edit.row)}
                onChange={(value) => setEdit({ ...edit, value })}
                onCommit={commitEdit}
                onCancel={cancelEdit}
              />
            )}
          </div>
          {rowCount === 0 && (
            <div className={styles.emptyHint} style={{ left: gutterWidth, top: HEADER_HEIGHT }}>
              No rows yet — press ⌥↓ to add one.
            </div>
          )}
        </div>
      </ContextMenu>
      {sheetRow !== null && sheetRow < rowCount && (
        <RowSheet
          model={model}
          row={sheetRow}
          initialCol={cursor.col}
          onCommit={commitFromSheet}
          onNavigate={(row, col) => {
            setSheetRow(row);
            setCursor({ row, col });
            revealCell({ row, col });
          }}
          onClose={(col) => {
            setSheetRow(null);
            setCursor((c) => ({ row: c.row, col }));
            focusSink();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface HeaderCellProps {
  col: number;
  label: string;
  left: number;
  width: number;
  active: boolean;
  inActiveCol: boolean;
  numeric: boolean;
  sort: SortDirection | null;
  onPointer: (row: number, col: number, kind: "down" | "double" | "context") => void;
  onSort: (col: number) => void;
  onResize: (col: number, width: number) => void;
}

const HeaderCell = memo(function HeaderCell({
  col,
  label,
  left,
  width,
  active,
  inActiveCol,
  numeric,
  sort,
  onPointer,
  onSort,
  onResize,
}: HeaderCellProps) {
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onResize(col, startWidth + ev.clientX - startX);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  return (
    <div
      className={styles.headerCell}
      style={{ left, width }}
      data-active={active}
      data-active-col={inActiveCol}
      data-numeric={numeric}
      data-sorted={sort !== null}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onPointer(-1, col, "down");
      }}
      onDoubleClick={() => onPointer(-1, col, "double")}
      onContextMenu={() => onPointer(-1, col, "context")}
      title={label || undefined}
    >
      <span className={styles.headerLabel} data-placeholder={!label}>
        {label || `Column ${col + 1}`}
      </span>
      <button
        type="button"
        tabIndex={-1}
        className={styles.sortButton}
        data-sort={sort ?? "none"}
        aria-label={sort === "asc" ? "Sorted ascending" : sort === "desc" ? "Sorted descending" : "Sort"}
        title="Sort"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => onSort(col)}
      >
        <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
          <path className={styles.sortUp} d="M4 0.5 7.25 4H0.75Z" />
          <path className={styles.sortDown} d="M4 9.5 0.75 6H7.25Z" />
        </svg>
      </button>
      <div className={styles.resizeHandle} onPointerDown={startResize} onDoubleClick={(e) => e.stopPropagation()} />
    </div>
  );
});

interface TableRowProps {
  row: number;
  model: CsvModel;
  version: number;
  /** Changes when the view order changes, so rows re-render on sort. */
  sortKey: string;
  top: number;
  height: number;
  wrap: boolean;
  cols: number[];
  colOffsets: number[];
  gutterWidth: number;
  width: number;
  numeric: boolean[];
  /** The active column if this is the active row, else -1. */
  activeCol: number;
  onPointer: (row: number, col: number, kind: "down" | "double" | "context") => void;
}

/** One rendered row. Memoized so scrolling only renders rows that appear,
 *  and moving the cursor only re-renders the two rows it leaves and enters. */
const TableRow = memo(function TableRow({
  row,
  model,
  top,
  height,
  wrap,
  cols,
  colOffsets,
  gutterWidth,
  width,
  numeric,
  activeCol,
  onPointer,
}: TableRowProps) {
  const style: CSSProperties = { top, width, height };
  return (
    <div className={styles.row} style={style} data-active={activeCol >= 0} data-row={row} data-wrap={wrap}>
      <div className={styles.gutter} style={{ width: gutterWidth }}>
        {row + 1}
      </div>
      {cols.map((c) => {
        const value = model.getCell(row, c);
        return (
          <div
            key={c}
            className={styles.cell}
            style={{ left: gutterWidth + colOffsets[c], width: colOffsets[c + 1] - colOffsets[c] }}
            data-active={activeCol === c}
            data-numeric={numeric[c]}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onPointer(row, c, "down");
            }}
            onDoubleClick={() => onPointer(row, c, "double")}
            onContextMenu={() => onPointer(row, c, "context")}
          >
            <div className={styles.cellText} data-cell-text="">
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
});

interface CellEditorProps {
  state: EditState;
  left: number;
  top: number;
  width: number;
  height: number;
  onChange: (value: string) => void;
  onCommit: (state: EditState, move?: { dRow: number; dCol: number }) => void;
  onCancel: () => void;
}

/** The in-place editor. Enter commits and stays on the cell, Tab moves right,
 *  ⇧↵ or ⌥↵ inserts a line break (CSV cells may hold several lines), Escape
 *  cancels, and clicking elsewhere commits. */
function CellEditor({ state, left, top, width, height, onChange, onCommit, onCancel }: CellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  // Grow downward for multi-line values instead of scrolling inside the box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = `${height}px`;
    if (el.scrollHeight > height) el.style.height = `${Math.min(el.scrollHeight, height * 8)}px`;
  }, [state.value, height]);

  function finish(move?: { dRow: number; dCol: number }) {
    if (done.current) return;
    done.current = true;
    onCommit(state, move);
  }

  return (
    <textarea
      ref={ref}
      className={styles.editor}
      style={{ left, top, width: Math.max(width, 160), minHeight: height }}
      value={state.value}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        // Keys the editor owns stay here (Escape would otherwise also leave
        // fullscreen); everything else, like ⌘K, reaches the app as usual.
        if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape") e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          finish({ dRow: 0, dCol: 0 });
        } else if (e.key === "Enter" && e.altKey) {
          // Shift+Enter inserts a newline natively; Alt+Enter on macOS doesn't.
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart, selectionEnd, value } = el;
          onChange(value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd));
          requestAnimationFrame(() => el.setSelectionRange(selectionStart + 1, selectionStart + 1));
        } else if (e.key === "Tab") {
          e.preventDefault();
          finish({ dRow: 0, dCol: e.shiftKey ? -1 : 1 });
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

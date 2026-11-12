/**
 * CSV parsing, serialization and the editable table model behind the CSV
 * view.
 *
 * Two properties matter more than anything else here:
 *
 *  - Speed. A 100k-row file has to open instantly, so the parser is a single
 *    pass over char codes that slices fields straight out of the source
 *    string (no per-character concatenation), and the model never copies the
 *    whole table for a single-cell edit.
 *
 *  - Minimal diffs. These files live in notes folders, often under git.
 *    Editing one cell must not re-quote or re-format every other line, so
 *    each parsed row remembers its exact source text, and serialization
 *    writes that text back verbatim for any row nobody touched. Rows are
 *    treated as immutable: an edit replaces the row array via `slice()`,
 *    which doesn't carry the `raw` property over — so "untouched" is
 *    detected for free. (A property rather than a WeakMap keyed by row:
 *    the WeakMap cost ~40% of parse time at 100k rows.)
 */

/** A row's cells. Parsed rows also carry their exact source line as `raw`;
 *  any copy (`slice()`) drops it, so an edited row is re-encoded. */
export type Row = string[] & { raw?: string };

export interface CsvDocument {
  header: Row;
  rows: Row[];
  delimiter: string;
  newline: "\n" | "\r\n";
  bom: boolean;
  trailingNewline: boolean;
}

const QUOTE = 34; // "
const CR = 13;
const LF = 10;

const CANDIDATE_DELIMITERS = [",", ";", "\t"];

/** Picks the delimiter that occurs most often (outside quotes) on the first
 *  line, preferring comma on a tie or when none occur. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  const limit = Math.min(text.length, 64 * 1024);
  for (let i = 0; i < limit; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ",";
  for (const d of CANDIDATE_DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

/**
 * RFC 4180 parser, lenient the way spreadsheet apps are: a quote in the
 * middle of an unquoted field is kept literally, text after a closing quote
 * is kept, and an unterminated quote runs to the end of the file. The first
 * record becomes the header.
 */
export function parseCsv(input: string, delimiter?: string): CsvDocument {
  const bom = input.charCodeAt(0) === 0xfeff;
  const text = bom ? input.slice(1) : input;
  const delim = delimiter ?? detectDelimiter(text);
  const delimCode = delim.charCodeAt(0);
  const len = text.length;

  const firstLf = text.indexOf("\n");
  const newline = firstLf > 0 && text.charCodeAt(firstLf - 1) === CR ? "\r\n" : "\n";

  const records: Row[] = [];
  let i = 0;
  let trailingNewline = false;

  while (i < len) {
    const recordStart = i;
    const row: Row = [];
    row.raw = undefined;
    let recordEnd = len;

    // One field per iteration; the loop ends on a line break or EOF.
    for (;;) {
      if (text.charCodeAt(i) === QUOTE) {
        // Quoted field: collect runs between doubled quotes as slices.
        let value = "";
        let runStart = i + 1;
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q === -1) {
            value += text.slice(runStart);
            i = len;
            break;
          }
          if (text.charCodeAt(q + 1) === QUOTE) {
            value += text.slice(runStart, q + 1);
            i = q + 2;
            runStart = i;
            continue;
          }
          value += text.slice(runStart, q);
          i = q + 1;
          break;
        }
        // Anything between the closing quote and the next delimiter.
        const tailStart = i;
        while (i < len) {
          const c = text.charCodeAt(i);
          if (c === delimCode || c === LF || c === CR) break;
          i++;
        }
        if (i > tailStart) value += text.slice(tailStart, i);
        row.push(value);
      } else {
        const start = i;
        while (i < len) {
          const c = text.charCodeAt(i);
          if (c === delimCode || c === LF || c === CR) break;
          i++;
        }
        row.push(text.slice(start, i));
      }

      if (i >= len) {
        recordEnd = len;
        break;
      }
      const c = text.charCodeAt(i);
      if (c === delimCode) {
        i++;
        continue;
      }
      // Line break: \n, \r\n or a lone \r.
      recordEnd = i;
      i += c === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
      if (i >= len) trailingNewline = true;
      break;
    }

    row.raw = text.slice(recordStart, recordEnd);
    records.push(row);
  }

  const header = records.length > 0 ? records[0] : [];
  return {
    header,
    rows: records.slice(1),
    delimiter: delim,
    newline,
    bom,
    trailingNewline: records.length === 0 ? false : trailingNewline,
  };
}

function needsQuotes(value: string, delimiter: string): boolean {
  return (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  );
}

export function encodeField(value: string, delimiter: string): string {
  return needsQuotes(value, delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function encodeRow(row: Row, delimiter: string): string {
  if (row.raw !== undefined) return row.raw;
  let out = "";
  for (let i = 0; i < row.length; i++) {
    if (i > 0) out += delimiter;
    out += encodeField(row[i], delimiter);
  }
  return out;
}

export function serializeCsv(doc: CsvDocument): string {
  const lines: string[] = new Array(doc.rows.length + 1);
  lines[0] = encodeRow(doc.header, doc.delimiter);
  for (let i = 0; i < doc.rows.length; i++) lines[i + 1] = encodeRow(doc.rows[i], doc.delimiter);
  // An empty document (no header, no rows) is an empty file, not one blank line.
  if (doc.rows.length === 0 && doc.header.length === 0) return doc.bom ? "﻿" : "";
  return (doc.bom ? "﻿" : "") + lines.join(doc.newline) + (doc.trailingNewline ? doc.newline : "");
}

/** Splits clipboard text copied from a spreadsheet (tab-separated, one line
 *  per row) into a block of cells. */
export function parseClipboardBlock(text: string): string[][] {
  const trimmed = text.replace(/\r?\n$/, "");
  if (!trimmed.includes("\t") && !trimmed.includes("\n")) return [[trimmed]];
  const parsed = parseCsv(trimmed, "\t");
  return [parsed.header, ...parsed.rows];
}

export function encodeClipboardBlock(block: string[][]): string {
  return block.map((row) => row.map((v) => encodeField(v, "\t")).join("\t")).join("\n");
}

/* ------------------------------------------------------------------------ */
/* Editable model                                                           */
/* ------------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc";
export interface SortSpec {
  column: number;
  direction: SortDirection;
}

interface Change {
  undo: () => void;
  redo: () => void;
  /** Where the cursor should land after undo/redo, in display coordinates. */
  cursor: { row: number; col: number };
}

const UNDO_LIMIT = 200;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * The table being edited. Row indices in its public API are *display*
 * indices: when a sort is active, `order` maps display position to the
 * underlying row. Sorting is view-only — it never changes what's written to
 * disk — and it is frozen once applied: editing a cell doesn't re-sort, so
 * rows don't jump out from under the cursor. Header cells are addressed as
 * row -1.
 */
export class CsvModel {
  header: Row;
  rows: Row[];
  readonly delimiter: string;
  readonly newline: "\n" | "\r\n";
  readonly bom: boolean;
  readonly trailingNewline: boolean;

  sort: SortSpec | null = null;
  private order: number[] | null = null;
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];
  columnCount = 1;

  constructor(doc: CsvDocument) {
    this.header = doc.header;
    this.rows = doc.rows;
    this.delimiter = doc.delimiter;
    this.newline = doc.newline;
    this.bom = doc.bom;
    // A file built up from empty should end in a newline like any other.
    this.trailingNewline = doc.trailingNewline || (doc.header.length === 0 && doc.rows.length === 0);
    this.recount();
  }

  static fromText(text: string): CsvModel {
    return new CsvModel(parseCsv(text));
  }

  get rowCount(): number {
    return this.rows.length;
  }

  serialize(): string {
    return serializeCsv({
      header: this.header,
      rows: this.rows,
      delimiter: this.delimiter,
      newline: this.newline,
      bom: this.bom,
      trailingNewline: this.trailingNewline,
    });
  }

  private recount() {
    let max = Math.max(1, this.header.length);
    const rows = this.rows;
    for (let i = 0; i < rows.length; i++) if (rows[i].length > max) max = rows[i].length;
    this.columnCount = max;
  }

  modelIndex(displayRow: number): number {
    return this.order ? this.order[displayRow] : displayRow;
  }

  getCell(displayRow: number, col: number): string {
    if (displayRow < 0) return this.header[col] ?? "";
    return this.rows[this.modelIndex(displayRow)]?.[col] ?? "";
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private push(change: Change) {
    change.redo();
    this.undoStack.push(change);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): { row: number; col: number } | null {
    const change = this.undoStack.pop();
    if (!change) return null;
    change.undo();
    this.redoStack.push(change);
    return change.cursor;
  }

  redo(): { row: number; col: number } | null {
    const change = this.redoStack.pop();
    if (!change) return null;
    change.redo();
    this.undoStack.push(change);
    return change.cursor;
  }

  /* --- Cell edits: replace one row array, O(row length). --------------- */

  private replaceRow(modelRow: number, next: Row) {
    if (modelRow < 0) this.header = next;
    else this.rows[modelRow] = next;
  }

  private rowAt(modelRow: number): Row {
    return modelRow < 0 ? this.header : this.rows[modelRow];
  }

  setCell(displayRow: number, col: number, value: string) {
    if (this.getCell(displayRow, col) === value) return;
    const modelRow = displayRow < 0 ? -1 : this.modelIndex(displayRow);
    const before = this.rowAt(modelRow);
    const after = before.slice();
    while (after.length < col) after.push("");
    after[col] = value;
    const prevCount = this.columnCount;
    this.push({
      cursor: { row: displayRow, col },
      redo: () => {
        this.replaceRow(modelRow, after);
        if (after.length > this.columnCount) this.columnCount = after.length;
      },
      undo: () => {
        this.replaceRow(modelRow, before);
        this.columnCount = prevCount;
      },
    });
  }

  /* --- Structural edits: swap whole snapshots. -------------------------
   * These copy the outer row array (pointers only, not cells), so undo is
   * just putting the old arrays back. Later cell edits mutate the live
   * array in place, which is safe because undo is strictly LIFO: by the
   * time a structural change is undone, every edit made after it already
   * has been. */

  private structural(cursor: { row: number; col: number }, mutate: () => void) {
    const before = { header: this.header, rows: this.rows, order: this.order, sort: this.sort };
    this.header = this.header.slice();
    this.rows = this.rows.slice();
    this.order = this.order ? this.order.slice() : null;
    mutate();
    const after = { header: this.header, rows: this.rows, order: this.order, sort: this.sort };
    // Restore, then let push() apply it, so redo and the first apply share a path.
    Object.assign(this, before);
    const restore = (s: typeof before) => {
      this.header = s.header;
      this.rows = s.rows;
      this.order = s.order;
      this.sort = s.sort;
      this.recount();
    };
    this.push({ cursor, redo: () => restore(after), undo: () => restore(before) });
  }

  /** Inserts an empty row at display position `displayRow` (0..rowCount). */
  insertRow(displayRow: number) {
    const at = Math.max(0, Math.min(displayRow, this.rows.length));
    this.structural({ row: at, col: 0 }, () => {
      const blank: Row = new Array(Math.max(1, this.header.length)).fill("");
      if (this.order) {
        // Into the model just after the row above it, and into the frozen
        // view exactly where it was asked for.
        const modelAt = at > 0 ? this.order[at - 1] + 1 : 0;
        for (let i = 0; i < this.order.length; i++) if (this.order[i] >= modelAt) this.order[i]++;
        this.order.splice(at, 0, modelAt);
        this.rows.splice(modelAt, 0, blank);
      } else {
        this.rows.splice(at, 0, blank);
      }
    });
  }

  deleteRow(displayRow: number) {
    if (displayRow < 0 || displayRow >= this.rows.length) return;
    const cursorRow = Math.max(0, Math.min(displayRow, this.rows.length - 2));
    this.structural({ row: cursorRow, col: 0 }, () => {
      if (this.order) {
        const modelAt = this.order[displayRow];
        this.order.splice(displayRow, 1);
        for (let i = 0; i < this.order.length; i++) if (this.order[i] > modelAt) this.order[i]--;
        this.rows.splice(modelAt, 1);
      } else {
        this.rows.splice(displayRow, 1);
      }
    });
  }

  /** Inserts an empty column before `col` (0..columnCount). Rows too short
   *  to reach `col` are left alone — they already read as empty there. */
  insertColumn(col: number) {
    const at = Math.max(0, Math.min(col, this.columnCount));
    this.structural({ row: -1, col: at }, () => {
      const pad = (row: Row): Row => {
        if (row.length < at) return row;
        const next = row.slice();
        next.splice(at, 0, "");
        return next;
      };
      // The header always reaches the new column, so it gets a name slot.
      const header = this.header.slice();
      while (header.length < at) header.push("");
      header.splice(at, 0, "");
      this.header = header;
      for (let i = 0; i < this.rows.length; i++) this.rows[i] = pad(this.rows[i]);
      if (this.sort && this.sort.column >= at) this.sort = { ...this.sort, column: this.sort.column + 1 };
    });
  }

  deleteColumn(col: number) {
    if (this.columnCount <= 1) return;
    this.structural({ row: -1, col: Math.max(0, Math.min(col, this.columnCount - 2)) }, () => {
      const drop = (row: Row): Row => {
        if (row.length <= col) return row;
        const next = row.slice();
        next.splice(col, 1);
        return next;
      };
      this.header = drop(this.header);
      for (let i = 0; i < this.rows.length; i++) this.rows[i] = drop(this.rows[i]);
      if (this.sort?.column === col) {
        this.sort = null;
        this.order = null;
      } else if (this.sort && this.sort.column > col) {
        this.sort = { ...this.sort, column: this.sort.column - 1 };
      }
    });
  }

  /** Writes a block of cells with its top-left at (displayRow, col),
   *  appending rows (and widening the table) as needed. One undo step. */
  pasteBlock(displayRow: number, col: number, block: string[][]) {
    if (block.length === 0) return;
    if (block.length === 1 && block[0].length === 1) {
      this.setCell(displayRow, col, block[0][0]);
      return;
    }
    this.structural({ row: displayRow, col }, () => {
      for (let r = 0; r < block.length; r++) {
        const target = displayRow + r;
        let modelRow: number;
        if (target < 0) {
          modelRow = -1;
        } else if (target < this.rows.length) {
          modelRow = this.modelIndex(target);
        } else {
          this.rows.push([]);
          modelRow = this.rows.length - 1;
          this.order?.push(modelRow);
        }
        const next = this.rowAt(modelRow).slice();
        while (next.length < col) next.push("");
        for (let c = 0; c < block[r].length; c++) next[col + c] = block[r][c];
        this.replaceRow(modelRow, next);
      }
    });
  }

  /* --- Sorting (view only, not undoable). ------------------------------ */

  setSort(spec: SortSpec | null) {
    this.sort = spec;
    if (!spec) {
      this.order = null;
      return;
    }
    const { column, direction } = spec;
    const n = this.rows.length;
    const values: string[] = new Array(n);
    let numeric = true;
    let anyValue = false;
    for (let i = 0; i < n; i++) {
      const v = (this.rows[i][column] ?? "").trim();
      values[i] = v;
      if (v !== "") {
        anyValue = true;
        if (numeric && !Number.isFinite(Number(v))) numeric = false;
      }
    }
    numeric = numeric && anyValue;
    const nums = numeric ? values.map((v) => (v === "" ? 0 : Number(v))) : null;
    const sign = direction === "asc" ? 1 : -1;
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => {
      const va = values[a];
      const vb = values[b];
      // Empty cells go last in either direction.
      if (va === "" || vb === "") return va === vb ? a - b : va === "" ? 1 : -1;
      const cmp = nums ? nums[a] - nums[b] : collator.compare(va, vb);
      return cmp !== 0 ? cmp * sign : a - b;
    });
    this.order = order;
  }
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CsvModel } from "@/lib/csv";
import styles from "./RowSheet.module.css";

interface RowSheetProps {
  model: CsvModel;
  /** Display index of the row shown. */
  row: number;
  /** Column whose field is focused when the sheet opens. */
  initialCol: number;
  /** Writes one field; called only for values that actually changed. */
  onCommit: (row: number, col: number, value: string) => void;
  /** Moves the sheet to another row (already clamped by the caller). */
  onNavigate: (row: number, col: number) => void;
  /** Closes the sheet, leaving the table's cursor on `col`. */
  onClose: (col: number) => void;
}

/**
 * One row as a record: column names down the left, values on the right,
 * every value editable in place. Opened with ⌘↵ from the table.
 *
 * Fields hold local drafts and write through on blur, on Enter, when moving
 * to another row, and on close — each changed field is its own undo step,
 * just like editing the cell in the grid.
 */
export function RowSheet({ model, row, initialCol, onCommit, onNavigate, onClose }: RowSheetProps) {
  const colCount = model.columnCount;
  const [drafts, setDrafts] = useState<string[]>(() => readRow(model, row, colCount));
  const fieldRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusedCol = useRef(initialCol);

  // A different row (or a reload from disk) starts from the model again.
  useEffect(() => {
    setDrafts(readRow(model, row, colCount));
  }, [model, row, colCount]);

  useLayoutEffect(() => {
    const field = fieldRefs.current[focusedCol.current] ?? fieldRefs.current[0];
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
    const end = field?.value.length ?? 0;
    field?.setSelectionRange(end, end);
  }, [row]);

  function commit(col: number) {
    const value = drafts[col] ?? "";
    if (value !== model.getCell(row, col)) onCommit(row, col, value);
  }

  function commitAll() {
    for (let c = 0; c < colCount; c++) commit(c);
  }

  function close() {
    commitAll();
    onClose(focusedCol.current);
  }

  function go(delta: number) {
    const target = row + delta;
    if (target < 0 || target >= model.rowCount) return;
    commitAll();
    onNavigate(target, focusedCol.current);
  }

  function focusField(col: number) {
    fieldRefs.current[Math.max(0, Math.min(colCount - 1, col))]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape" || (mod && e.key === "Enter")) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (mod && e.key === "[") {
      e.preventDefault();
      go(-1);
    } else if (mod && e.key === "]") {
      e.preventDefault();
      go(1);
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={styles.sheet} role="dialog" aria-label={`Row ${row + 1}`} onKeyDown={onKeyDown}>
        <div className={styles.titleBar}>
          <span className={styles.title}>
            Row {row + 1}
            <span className={styles.of}> of {model.rowCount.toLocaleString()}</span>
          </span>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => go(-1)}
              disabled={row <= 0}
              title="Previous row (⌘[)"
              aria-label="Previous row"
            >
              <Chevron up />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => go(1)}
              disabled={row >= model.rowCount - 1}
              title="Next row (⌘])"
              aria-label="Next row"
            >
              <Chevron />
            </button>
            <button type="button" className={styles.iconButton} onClick={close} title="Close (Esc)" aria-label="Close">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.fields}>
          {drafts.map((value, col) => {
            const label = model.getCell(-1, col);
            const id = `row-sheet-field-${col}`;
            return (
              <div key={col} className={styles.field}>
                <label htmlFor={id} className={styles.key} data-placeholder={!label} title={label || undefined}>
                  {label || `Column ${col + 1}`}
                </label>
                <AutoTextarea
                  id={id}
                  ref={(el) => {
                    fieldRefs.current[col] = el;
                  }}
                  value={value}
                  onFocus={() => {
                    focusedCol.current = col;
                  }}
                  onChange={(next) =>
                    setDrafts((prev) => {
                      const copy = prev.slice();
                      copy[col] = next;
                      return copy;
                    })
                  }
                  onBlur={() => commit(col)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
                    // Enter moves on, like the grid; ⇧↵ / ⌥↵ add a line break.
                    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      commit(col);
                      if (col < colCount - 1) focusField(col + 1);
                    } else if (e.key === "Enter" && e.altKey) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const { selectionStart, selectionEnd } = el;
                      setDrafts((prev) => {
                        const copy = prev.slice();
                        copy[col] = value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
                        return copy;
                      });
                      requestAnimationFrame(() => el.setSelectionRange(selectionStart + 1, selectionStart + 1));
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className={styles.footer}>
          <span>↵ next field</span>
          <span>⇧↵ line break</span>
          <span>⌘[ ⌘] previous / next row</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function readRow(model: CsvModel, row: number, colCount: number): string[] {
  return Array.from({ length: colCount }, (_, c) => model.getCell(row, c));
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d={up ? "M2 6.5 5 3.5 8 6.5" : "M2 3.5 5 6.5 8 3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface AutoTextareaProps {
  id: string;
  ref: (el: HTMLTextAreaElement | null) => void;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/** A textarea as tall as its text, so long values read in full. */
function AutoTextarea({ id, ref, value, onChange, onFocus, onBlur, onKeyDown }: AutoTextareaProps) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const pointerFocus = useRef(false);
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={(el) => {
        own.current = el;
        ref(el);
      }}
      className={styles.value}
      value={value}
      rows={1}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={() => {
        pointerFocus.current = true;
      }}
      onFocus={(e) => {
        // Arriving by keyboard (Tab, Enter from the field above) lands at the
        // end of the value, ready to append; a click keeps the clicked spot.
        if (!pointerFocus.current) {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }
        pointerFocus.current = false;
        onFocus();
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}

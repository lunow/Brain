import { EditorView, WidgetType } from "@codemirror/view";
import contextMenuStyles from "@/components/common/ContextMenu.module.css";

type Align = "left" | "right" | "center" | null;

interface ParsedTable {
  headerCells: string[];
  alignments: Align[];
  rows: string[][];
}

/** Splits a `| a | b |` row on unescaped pipes, trimming the outer pair. */
function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
    } else if (trimmed[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseAlignment(delimiterCell: string): Align {
  const t = delimiterCell.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/**
 * Parses raw GFM table source directly (rather than walking Lezer's
 * per-cell inline-parsed nodes) since alignment isn't exposed as a
 * distinct node type there — the delimiter row's `:---:`/`---:` syntax
 * has to be read back out of the source text either way.
 */
function parseTableSource(source: string): ParsedTable | null {
  const lines = source.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const headerCells = splitRow(lines[0]);
  const delimiterCells = splitRow(lines[1]);
  const alignments = delimiterCells.map(parseAlignment);
  const rows = lines.slice(2).map(splitRow);

  return { headerCells, alignments, rows };
}

/** Moves `arr[from]` so it sits at index `to` of the *original* (pre-move)
 *  array — i.e. "insert before what is currently index `to`". Splicing out
 *  first shifts everything after `from` left by one, so the insertion index
 *  needs the same adjustment whenever it fell after the removed slot. */
function moveItem<T>(arr: T[], from: number, to: number): void {
  if (from === to) return;
  const [item] = arr.splice(from, 1);
  arr.splice(from < to ? to - 1 : to, 0, item);
}

function insertRow(parsed: ParsedTable, index: number): void {
  parsed.rows.splice(index, 0, parsed.headerCells.map(() => ""));
}

function deleteRow(parsed: ParsedTable, index: number): void {
  parsed.rows.splice(index, 1);
}

function insertColumn(parsed: ParsedTable, index: number): void {
  parsed.headerCells.splice(index, 0, "");
  parsed.alignments.splice(index, 0, null);
  parsed.rows.forEach((row) => row.splice(index, 0, ""));
}

/** No-ops below one column — a table needs at least one to stay valid GFM
 *  (and to leave something for the "insert column" affordance to sit on). */
function deleteColumn(parsed: ParsedTable, index: number): void {
  if (parsed.headerCells.length <= 1) return;
  parsed.headerCells.splice(index, 1);
  parsed.alignments.splice(index, 1);
  parsed.rows.forEach((row) => row.splice(index, 1));
}

/**
 * Renders `` `code` ``, `**bold**`, `*italic*`, and `[text](url)` within a
 * cell to real DOM nodes via textContent only — never innerHTML/string
 * concatenation. This app can open arbitrary .md files and the webview has
 * privileged Tauri command access, so treat cell content as untrusted
 * input, not just a styling convenience.
 *
 * Links get the same `cm-mkLink`/`data-href` markup the live-preview
 * renderer uses (see livePreview.ts), so the existing Cmd/Ctrl-click
 * handler in mdLink.ts — which delegates off `[data-href]` anywhere in the
 * editor — opens them without any table-specific wiring.
 */
function renderInlineMarkdownToNodes(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[1];
      frag.appendChild(code);
    } else if (match[2] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      frag.appendChild(strong);
    } else if (match[3] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[3];
      frag.appendChild(em);
    } else if (match[4] !== undefined) {
      const link = document.createElement("span");
      link.className = "cm-mkLink";
      link.dataset.href = match[5];
      link.title = "⌘-click to open";
      link.textContent = match[4];
      frag.appendChild(link);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return frag;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function alignMarker(align: Align): string {
  if (align === "left") return ":--";
  if (align === "right") return "--:";
  if (align === "center") return ":-:";
  return "---";
}

function serializeRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(" | ")} |`;
}

function serializeTable(parsed: ParsedTable): string {
  const lines = [
    serializeRow(parsed.headerCells),
    serializeRow(parsed.headerCells.map((_, i) => alignMarker(parsed.alignments[i] ?? null))),
    ...parsed.rows.map(serializeRow),
  ];
  return lines.join("\n");
}

/**
 * Wires a single th/td for click-to-edit: the cell shows rendered inline
 * markdown (bold/code/italic as real elements) until clicked, at which
 * point it swaps to its raw markdown source in a contentEditable region so
 * formatting syntax can be typed directly. Committing (blur/Enter) rewrites
 * that one cell's raw text in `parsed` and reserializes the whole table
 * back into the document; CM6 then rebuilds this widget from fresh source,
 * which naturally restores the rendered (non-editable) view.
 */
function attachCellEditing(cell: HTMLElement, getRaw: () => string, setRaw: (text: string) => void, commit: () => void) {
  cell.addEventListener("mousedown", (e) => {
    // Right/middle-click reach this cell too (e.g. to open the row/column
    // context menu) — only a plain left click should enter edit mode.
    if (e.button !== 0) return;
    if (cell.isContentEditable) return;
    e.preventDefault();
    const raw = getRaw();
    cell.textContent = raw;
    cell.contentEditable = "true";
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });

  cell.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      cell.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cell.textContent = getRaw();
      cell.blur();
    }
  });

  cell.addEventListener("blur", () => {
    if (!cell.isContentEditable) return;
    const newRaw = (cell.textContent ?? "").replace(/\n/g, " ").trim();
    cell.contentEditable = "false";
    const original = getRaw();
    if (newRaw === original) {
      cell.textContent = "";
      cell.appendChild(renderInlineMarkdownToNodes(original));
      return;
    }
    setRaw(newRaw);
    commit();
  });
}

type MenuEntry = { label: string; onSelect: () => void } | "separator";

/** A minimal vanilla popup menu, styled to match the app's React
 *  `ContextMenu` component (src/components/common/ContextMenu.tsx) by
 *  reusing its CSS module — a plain `WidgetType` DOM tree sits outside
 *  React, so that component itself can't be mounted here. Destructive
 *  entries are marked with a preceding "separator", matching the
 *  Delete-after-a-divider convention used by the file tree's own
 *  context menus rather than any color coding (this app's palette is
 *  deliberately monochrome — see tokens.css). */
function openContextMenu(x: number, y: number, items: MenuEntry[]) {
  document.querySelector(`.${CSS.escape(contextMenuStyles.content)}[data-table-menu]`)?.remove();

  const menu = document.createElement("div");
  menu.className = contextMenuStyles.content;
  menu.dataset.tableMenu = "true";
  menu.style.position = "fixed";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = "1000";

  for (const item of items) {
    if (item === "separator") {
      const sep = document.createElement("div");
      sep.className = contextMenuStyles.separator;
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = contextMenuStyles.item;
    btn.textContent = item.label;
    btn.addEventListener("mouseenter", () => (btn.dataset.highlighted = "true"));
    btn.addEventListener("mouseleave", () => delete btn.dataset.highlighted);
    btn.addEventListener("click", () => {
      close();
      item.onSelect();
    });
    menu.appendChild(btn);
  }

  function close() {
    menu.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e: MouseEvent) {
    if (!menu.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 8)}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 8)}px`;

  // Deferred so the mousedown that opened the menu (the right-click itself)
  // doesn't immediately count as an "outside" click and close it again.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

function createGripIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 10 14");
  svg.setAttribute("aria-hidden", "true");
  const dots = [
    [2.5, 2.5],
    [7, 2.5],
    [2.5, 7],
    [7, 7],
    [2.5, 11.5],
    [7, 11.5],
  ];
  for (const [cx, cy] of dots) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", "1.1");
    circle.setAttribute("fill", "currentColor");
    svg.appendChild(circle);
  }
  return svg;
}

function createPlusIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M8 3v10M3 8h10");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.3");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
}

/** Drop-position indicator (border on the leading edge of the target)
 *  shared by both row and column drag-over handling. */
function setDropIndicator(el: HTMLElement, edge: "before" | "after" | null, axis: "row" | "col") {
  el.classList.remove("cm-mkDropBefore", "cm-mkDropAfter");
  if (edge === "before") el.classList.add(axis === "row" ? "cm-mkDropBefore" : "cm-mkDropBeforeCol");
  if (edge === "after") el.classList.add(axis === "row" ? "cm-mkDropAfter" : "cm-mkDropAfterCol");
}

type DragPayload = { kind: "row" | "col"; index: number };

export class TableWidget extends WidgetType {
  constructor(
    private source: string,
    private from: number,
    private to: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return other.source === this.source;
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-mkTableContainer";

    const parsed = parseTableSource(this.source);
    if (!parsed) {
      container.textContent = this.source;
      return container;
    }

    const commit = () => {
      const newSource = serializeTable(parsed);
      if (newSource === this.source) return;
      view.dispatch({ changes: { from: this.from, to: this.to, insert: newSource } });
    };

    const table = document.createElement("table");
    table.className = "cm-mkTable";

    // --- header row (+ its column-drag grips and the trailing "add column"
    // control) ---
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    const rowHandleHeaderCell = document.createElement("th");
    rowHandleHeaderCell.className = "cm-mkRowHandleCell";
    headRow.appendChild(rowHandleHeaderCell);

    parsed.headerCells.forEach((cell, i) => {
      const th = document.createElement("th");
      applyAlign(th, parsed.alignments[i]);

      // attachCellEditing replaces its target's full textContent while
      // editing (and rebuilds it from scratch on blur) — scoping that to
      // an inner label span, rather than `th` itself, keeps the grip
      // (a sibling) from getting wiped out the first time this header
      // cell is edited.
      const label = document.createElement("span");
      label.className = "cm-mkCellLabel";
      label.appendChild(renderInlineMarkdownToNodes(cell));
      attachCellEditing(
        label,
        () => parsed.headerCells[i],
        (text) => {
          parsed.headerCells[i] = text;
        },
        commit,
      );

      const grip = createGripIcon();
      grip.setAttribute("class", "cm-mkColGrip");
      const gripTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
      gripTitle.textContent = "Drag to reorder column";
      grip.appendChild(gripTitle);
      grip.setAttribute("draggable", "true");
      grip.addEventListener("mousedown", (e) => e.stopPropagation());
      grip.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        e.dataTransfer?.setData("application/json", JSON.stringify({ kind: "col", index: i } satisfies DragPayload));
        e.dataTransfer!.effectAllowed = "move";
      });
      th.appendChild(grip);
      th.appendChild(label);

      // e.offsetX is relative to whatever nested element (e.g. a <strong>
      // inside the cell) is directly under the cursor, not to `th` itself —
      // th's own bounding rect + clientX is what actually measures position
      // within the column, matching how the row handler uses clientY.
      th.addEventListener("dragover", (e) => {
        e.preventDefault();
        const rect = th.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        setDropIndicator(th, before ? "before" : "after", "col");
      });
      th.addEventListener("dragleave", () => setDropIndicator(th, null, "col"));
      th.addEventListener("drop", (e) => {
        e.preventDefault();
        setDropIndicator(th, null, "col");
        const payload = readDragPayload(e);
        if (!payload || payload.kind !== "col") return;
        const rect = th.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        moveItem(parsed.headerCells, payload.index, before ? i : i + 1);
        moveItem(parsed.alignments, payload.index, before ? i : i + 1);
        parsed.rows.forEach((row) => moveItem(row, payload.index, before ? i : i + 1));
        commit();
      });

      th.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: "Insert column left", onSelect: () => (insertColumn(parsed, i), commit()) },
          { label: "Insert column right", onSelect: () => (insertColumn(parsed, i + 1), commit()) },
          ...(parsed.headerCells.length > 1
            ? (["separator", { label: "Delete column", onSelect: () => (deleteColumn(parsed, i), commit()) }] as const)
            : []),
        ]);
      });

      headRow.appendChild(th);
    });

    const addColCell = document.createElement("th");
    addColCell.className = "cm-mkTableAddCell";
    const addColBtn = document.createElement("button");
    addColBtn.type = "button";
    addColBtn.title = "Add column";
    addColBtn.appendChild(createPlusIcon());
    addColBtn.addEventListener("click", () => {
      insertColumn(parsed, parsed.headerCells.length);
      commit();
    });
    addColCell.appendChild(addColBtn);
    headRow.appendChild(addColCell);

    thead.appendChild(headRow);
    table.appendChild(thead);

    // --- body rows (+ their row-drag grip / context menu, and the
    // trailing "add row" control) ---
    const tbody = document.createElement("tbody");
    parsed.rows.forEach((row, r) => {
      const tr = document.createElement("tr");

      const rowHandleCell = document.createElement("td");
      rowHandleCell.className = "cm-mkRowHandleCell";
      const grip = createGripIcon();
      grip.setAttribute("class", "cm-mkRowGrip");
      const gripTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
      gripTitle.textContent = "Drag to reorder row";
      grip.appendChild(gripTitle);
      grip.setAttribute("draggable", "true");
      grip.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("application/json", JSON.stringify({ kind: "row", index: r } satisfies DragPayload));
        e.dataTransfer!.effectAllowed = "move";
      });
      rowHandleCell.appendChild(grip);
      tr.appendChild(rowHandleCell);

      row.forEach((cell, c) => {
        const td = document.createElement("td");
        td.appendChild(renderInlineMarkdownToNodes(cell));
        applyAlign(td, parsed.alignments[c]);
        attachCellEditing(
          td,
          () => parsed.rows[r][c],
          (text) => {
            parsed.rows[r][c] = text;
          },
          commit,
        );
        tr.appendChild(td);
      });

      const trailing = document.createElement("td");
      trailing.className = "cm-mkTableAddCell";
      tr.appendChild(trailing);

      tr.addEventListener("dragover", (e) => {
        e.preventDefault();
        const rect = tr.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        setDropIndicator(tr, before ? "before" : "after", "row");
      });
      tr.addEventListener("dragleave", () => setDropIndicator(tr, null, "row"));
      tr.addEventListener("drop", (e) => {
        e.preventDefault();
        setDropIndicator(tr, null, "row");
        const payload = readDragPayload(e);
        if (!payload || payload.kind !== "row") return;
        const rect = tr.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        moveItem(parsed.rows, payload.index, before ? r : r + 1);
        commit();
      });

      tr.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: "Insert row above", onSelect: () => (insertRow(parsed, r), commit()) },
          { label: "Insert row below", onSelect: () => (insertRow(parsed, r + 1), commit()) },
          "separator",
          { label: "Delete row", onSelect: () => (deleteRow(parsed, r), commit()) },
        ]);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Trailing "add row" strip — a sibling of <table>, not a <tr>, so it
    // doesn't skew tbody's own `tr:last-child` border rule (see editor.css)
    // onto a control instead of the actual last data row.
    const addRowStrip = document.createElement("div");
    addRowStrip.className = "cm-mkTableAddRowStrip";
    const addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.title = "Add row";
    addRowBtn.appendChild(createPlusIcon());
    addRowBtn.addEventListener("click", () => {
      insertRow(parsed, parsed.rows.length);
      commit();
    });
    addRowStrip.appendChild(addRowBtn);
    container.appendChild(addRowStrip);

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

function readDragPayload(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer?.getData("application/json");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

function applyAlign(cell: HTMLElement, align: Align) {
  if (!align) return;
  cell.style.textAlign = align;
  // Right-aligned columns are conventionally numeric (currency, counts);
  // tabular figures keep them from jittering as digits change.
  if (align === "right") cell.classList.add("cm-mkTableNumeric");
}

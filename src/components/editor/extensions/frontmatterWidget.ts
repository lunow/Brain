import { WidgetType } from "@codemirror/view";

export interface FrontmatterEntry {
  key: string;
  value: string;
}

/** Drops one layer of matching YAML quotes; anything else is shown as written. */
function unquote(value: string): string {
  const m = value.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : value;
}

/**
 * Splits frontmatter source (including the `---` fences) into its top-level
 * `key: value` pairs. Deliberately not a YAML parser: this only decides
 * what goes in which row. Indented lines below a key — a list, a nested
 * map, a block scalar — belong to that key and are kept as their own lines
 * in the value, with `- ` list markers dropped and flow lists `[a, b]`
 * put one item per line, so the cell reads as a column rather than as YAML.
 */
export function parseFrontmatter(source: string): FrontmatterEntry[] {
  const lines = source.split("\n");
  if (lines[0] === "---") lines.shift();
  if (lines[lines.length - 1] === "---") lines.pop();

  const entries: { key: string; parts: string[] }[] = [];
  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const top = /^([^\s#][^:]*?):(?:\s+(.*))?$/.exec(line);
    if (top && !line.startsWith("-")) {
      const value = (top[2] ?? "").trim();
      const flow = /^\[(.*)\]$/.exec(value);
      // An empty value or a block-scalar indicator (`|`, `>-`, …) means the
      // content follows on the indented lines below.
      const parts = flow
        ? flow[1].split(",").map((v) => unquote(v.trim())).filter(Boolean)
        : /^([|>][+-]?)?$/.test(value)
          ? []
          : [unquote(value)];
      entries.push({ key: top[1].trim(), parts });
      continue;
    }

    const last = entries[entries.length - 1];
    if (!last) continue;
    const item = line.trim().replace(/^-\s+/, "");
    last.parts.push(unquote(item));
  }

  return entries.map((e) => ({ key: e.key, value: e.parts.join("\n") }));
}

/**
 * The leading frontmatter block shown as a two-column key/value table.
 * Clicking it puts the caret inside the block, which hands the raw YAML
 * back for editing (livePreview gates this widget on the selection).
 */
export class FrontmatterWidget extends WidgetType {
  constructor(private source: string) {
    super();
  }

  eq(other: FrontmatterWidget) {
    return other.source === this.source;
  }

  toDOM() {
    const table = document.createElement("table");
    table.className = "cm-mkFrontmatterTable";
    const body = table.createTBody();

    for (const { key, value } of parseFrontmatter(this.source)) {
      const row = body.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = key;
      row.appendChild(th);
      row.insertCell().textContent = value;
    }

    return table;
  }

  // Let CM6 place the caret on click, which swaps the table for its source.
  ignoreEvent() {
    return false;
  }
}

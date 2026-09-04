import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { revealInFinder } from "@/lib/tauri-commands";

export interface DecorationEntry {
  from: number;
  to: number;
  deco: Decoration;
}

// A run of non-whitespace starting with "/" and not containing markdown
// delimiter characters that would make it ambiguous with surrounding syntax
// (parens/brackets/angle brackets already used by links and autolinks).
const PATH_PATTERN = /\/[^\s()<>[\]]+/g;
// Trailing punctuation is almost never part of the path itself ("see /a/b.").
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Finds absolute filesystem paths in the document's prose text and returns
 * mark decorations for them (Cmd/Ctrl-click reveals the path in Finder via
 * `pathLinkClickHandler`, below). Follows the same excluded-ranges
 * contract as `collectSmartTypographyDecorations`: the caller collects code,
 * frontmatter, and link-target ranges during its own tree walk so paths
 * inside those are left untouched.
 */
export function collectPathLinkDecorations(
  state: EditorState,
  excludedRanges: { from: number; to: number }[],
): DecorationEntry[] {
  const text = state.doc.toString();
  const sorted = [...excludedRanges].sort((a, b) => a.from - b.from);
  const overlapsExcluded = (from: number, to: number) => sorted.some((r) => from < r.to && to > r.from);

  const out: DecorationEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = PATH_PATTERN.exec(text))) {
    let from = match.index;
    let to = from + match[0].length;
    const trimMatch = text.slice(from, to).match(TRAILING_PUNCTUATION);
    if (trimMatch) to -= trimMatch[0].length;
    if (to <= from + 1) continue; // just "/" or nothing left after trimming
    if (overlapsExcluded(from, to)) continue;

    const path = text.slice(from, to);
    out.push({
      from,
      to,
      deco: Decoration.mark({
        class: "cm-mkPathLink",
        attributes: { title: "⌘-click to reveal in Finder", "data-path": path },
      }),
    });
  }
  return out;
}

/** Cmd/Ctrl-click on a `cm-mkPathLink` span reveals that path in Finder. */
export const pathLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const target = event.target as HTMLElement | null;
    const el = target?.closest?.("[data-path]") as HTMLElement | null;
    if (!el) return false;
    const path = el.getAttribute("data-path");
    if (!path) return false;
    event.preventDefault();
    revealInFinder(path);
    return true;
  },
});

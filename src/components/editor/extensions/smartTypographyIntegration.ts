import type { EditorState } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { findSmartTypographyMatches, type Locale } from "@/typography/smartText";

class SmartTextWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }
  eq(other: SmartTextWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    return span;
  }
}

/** Reads a `lang:`/`language:` field out of a leading frontmatter block, if any. */
function detectLocale(state: EditorState): Locale {
  const head = state.doc.sliceString(0, Math.min(state.doc.length, 500));
  const match = head.match(/^---\n[\s\S]*?\blang(?:uage)?:\s*["']?(\w{2})["']?/m);
  const code = match?.[1]?.toLowerCase();
  if (code === "de") return "de";
  if (code === "fr") return "fr";
  return "en";
}

export interface DecorationEntry {
  from: number;
  to: number;
  deco: Decoration;
}

/**
 * Runs smart typography over the whole document and returns decorations
 * for whichever matches don't fall inside `excludedRanges` — code spans,
 * fenced code, frontmatter, and link targets, collected by the caller
 * during its own tree walk. Applied unconditionally (not gated by
 * active-line like markdown-marker-hiding): the substitutions are meant
 * to be live as you type, the same way word processors auto-correct
 * quotes, not a "preview when unfocused" affordance.
 */
export function collectSmartTypographyDecorations(
  state: EditorState,
  excludedRanges: { from: number; to: number }[],
): DecorationEntry[] {
  const locale = detectLocale(state);
  const text = state.doc.toString();
  const matches = findSmartTypographyMatches(text, locale);
  const sorted = [...excludedRanges].sort((a, b) => a.from - b.from);

  const overlapsExcluded = (from: number, to: number) => sorted.some((r) => from < r.to && to > r.from);
  const pointExcluded = (pos: number) => sorted.some((r) => pos > r.from && pos < r.to);

  const out: DecorationEntry[] = [];
  for (const m of matches) {
    if (m.from === m.to) {
      if (pointExcluded(m.from)) continue;
      out.push({
        from: m.from,
        to: m.from,
        deco: Decoration.widget({ widget: new SmartTextWidget(m.replacement), side: 1 }),
      });
      continue;
    }
    if (overlapsExcluded(m.from, m.to)) continue;
    out.push({ from: m.from, to: m.to, deco: Decoration.replace({ widget: new SmartTextWidget(m.replacement) }) });
  }
  return out;
}

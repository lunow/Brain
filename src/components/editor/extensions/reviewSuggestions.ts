import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { PlacedSuggestion } from "@/lib/reviewSuggestions";
import { computeWordDiff } from "@/lib/wordDiff";

export type SuggestionAction = "accept" | "reject" | "dismiss";

export const setSuggestionsEffect = StateEffect.define<PlacedSuggestion[]>();
const resolveSuggestionEffect = StateEffect.define<{ id: string }>();

interface ReviewFieldState {
  suggestions: PlacedSuggestion[];
  decorations: DecorationSet;
}

/** A single word-level insertion within an "edit" suggestion's diff —
 *  just the added text, no buttons (those live in DiffActionsWidget at
 *  the end of the whole diff, one set per suggestion, not per word). */
class DiffInsertWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  eq(other: DiffInsertWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-reviewNew";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

/** Accept/reject controls for one "edit" suggestion, anchored at the end
 *  of its diff (after the last changed word). */
class DiffActionsWidget extends WidgetType {
  constructor(private suggestionId: string) {
    super();
  }

  eq(other: DiffActionsWidget) {
    return other.suggestionId === this.suggestionId;
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-reviewActionsWrap";
    wrap.appendChild(makeButton("cm-reviewAccept", "✓", this.suggestionId, "accept", "Accept suggestion"));
    wrap.appendChild(makeButton("cm-reviewReject", "✗", this.suggestionId, "reject", "Reject suggestion"));
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

/** Blue, non-editing callout — the "hint" suggestion type. */
class HintWidget extends WidgetType {
  constructor(private suggestion: PlacedSuggestion) {
    super();
  }

  eq(other: HintWidget) {
    return other.suggestion.id === this.suggestion.id && other.suggestion.comment === this.suggestion.comment;
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-reviewHintWrap";

    const badge = document.createElement("span");
    badge.className = "cm-reviewHint";
    badge.textContent = this.suggestion.comment ?? "";
    wrap.appendChild(badge);
    wrap.appendChild(makeButton("cm-reviewDismiss", "✗", this.suggestion.id, "dismiss", "Dismiss hint"));

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function makeButton(cls: string, label: string, id: string, action: SuggestionAction, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cm-reviewBtn ${cls}`;
  button.textContent = label;
  button.title = title;
  button.dataset.suggestionId = id;
  button.dataset.suggestionAction = action;
  return button;
}

interface Entry {
  from: number;
  to: number;
  deco: Decoration;
}

/**
 * Word-diffs the suggestion's quote against its replacement and emits
 * decorations only for the sub-spans that actually differ — shared text
 * is left completely undecorated in place, rather than showing the whole
 * quote struck through above a whole rewritten copy below. Accept/reject
 * still apply to the suggestion as a single unit (see applyReviewAction);
 * only the visual granularity changes here.
 */
function buildEditEntries(s: PlacedSuggestion): Entry[] {
  const entries: Entry[] = [];
  const parts = computeWordDiff(s.quote, s.replacement ?? "");
  let pos = s.from;

  for (const part of parts) {
    if (part.type === "equal") {
      pos += part.value.length;
    } else if (part.type === "removed") {
      if (part.value.length > 0) {
        entries.push({ from: pos, to: pos + part.value.length, deco: Decoration.mark({ class: "cm-reviewOld" }) });
      }
      pos += part.value.length;
    } else {
      entries.push({ from: pos, to: pos, deco: Decoration.widget({ widget: new DiffInsertWidget(part.value), side: 1 }) });
    }
  }

  entries.push({ from: s.to, to: s.to, deco: Decoration.widget({ widget: new DiffActionsWidget(s.id), side: 1 }) });
  return entries;
}

function buildDecorations(suggestions: PlacedSuggestion[]): DecorationSet {
  const entries: Entry[] = [];

  for (const s of suggestions) {
    if (s.from === s.to) continue;
    if (s.type === "edit") {
      entries.push(...buildEditEntries(s));
    } else {
      entries.push({ from: s.from, to: s.to, deco: Decoration.mark({ class: "cm-reviewHintAnchor" }) });
      entries.push({ from: s.to, to: s.to, deco: Decoration.widget({ widget: new HintWidget(s), side: 1 }) });
    }
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.deco);
  return builder.finish();
}

export const reviewSuggestionsField = StateField.define<ReviewFieldState>({
  create() {
    return { suggestions: [], decorations: Decoration.none };
  },
  update(value, tr) {
    let suggestions = value.suggestions;
    let changed = false;

    if (tr.docChanged) {
      suggestions = suggestions.map((s) => ({
        ...s,
        from: tr.changes.mapPos(s.from, 1),
        to: tr.changes.mapPos(s.to, -1),
      }));
      changed = true;
    }

    for (const effect of tr.effects) {
      if (effect.is(setSuggestionsEffect)) {
        suggestions = effect.value;
        changed = true;
      } else if (effect.is(resolveSuggestionEffect)) {
        const id = effect.value.id;
        suggestions = suggestions.filter((s) => s.id !== id);
        changed = true;
      }
    }

    if (!changed) return value;
    return { suggestions, decorations: buildDecorations(suggestions) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * Performs one suggestion's action: "accept" replaces [from, to) with the
 * replacement text, "reject"/"dismiss" just drop it — both are a single
 * transaction so the field's position bookkeeping (see `update` above)
 * stays consistent. Exported so the Review sidebar's own accept/reject/
 * dismiss buttons (which have no direct handle to widget DOM) can trigger
 * exactly the same behavior as clicking inline, via the EditorView
 * registered in useReviewStore.activeView.
 */
export function applyReviewAction(
  view: EditorView,
  suggestion: PlacedSuggestion,
  action: SuggestionAction,
  onResolve?: (id: string, action: SuggestionAction) => void,
) {
  if (action === "accept") {
    view.dispatch({
      changes: { from: suggestion.from, to: suggestion.to, insert: suggestion.replacement ?? "" },
      effects: resolveSuggestionEffect.of({ id: suggestion.id }),
    });
  } else {
    view.dispatch({ effects: resolveSuggestionEffect.of({ id: suggestion.id }) });
  }
  onResolve?.(suggestion.id, action);
}

/** StateField + click handling for inline suggestion buttons, bundled as
 *  one extension. Always included in MarkdownEditor's extension list (like
 *  the app's other decoration passes); inert with an empty suggestion
 *  list. */
export function reviewSuggestionsExtension(onResolve: (id: string, action: SuggestionAction) => void) {
  return [
    reviewSuggestionsField,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-suggestion-action]");
        if (!target) return false;
        const id = target.dataset.suggestionId;
        const action = target.dataset.suggestionAction as SuggestionAction | undefined;
        if (!id || !action) return false;
        const suggestion = view.state.field(reviewSuggestionsField).suggestions.find((s) => s.id === id);
        if (!suggestion) return false;
        event.preventDefault();
        applyReviewAction(view, suggestion, action, onResolve);
        return true;
      },
    }),
  ];
}

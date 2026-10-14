import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { livePreviewField } from "./livePreview";

function stateOf(doc: string, cursor: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), livePreviewField],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** The blank-line decorations as "<line>:<class>", in document order. */
function blankLines(state: EditorState): string[] {
  const out: string[] = [];
  state.field(livePreviewField).between(0, state.doc.length, (from, _to, deco) => {
    const cls = (deco.spec as { class?: string }).class;
    if (cls?.includes("cm-mkBlank")) out.push(`${state.doc.lineAt(from).number}:${cls}`);
  });
  return out;
}

describe("blank-line decorations", () => {
  it("collapses the blank lines between blocks, sparing the caret's own", () => {
    // "Hello\n\n" with the caret on the empty line just opened with Enter.
    expect(blankLines(stateOf("Hello\n\n", 7))).toEqual(["2:cm-mkBlank cm-mkGapLoose"]);
  });

  it("recollapses a line the caret has left, on a selection-only update", () => {
    const state = stateOf("Hello\n\n", 7);
    // A pure caret move: the doc and the syntax tree are untouched, which is
    // exactly the case the run cache has to not answer from a stale result.
    const moved = state.update({ selection: EditorSelection.cursor(0) }).state;
    expect(moved.doc.toString()).toBe(state.doc.toString());
    expect(blankLines(moved)).toEqual(["2:cm-mkBlank cm-mkGapLoose", "3:cm-mkBlank"]);
  });

  it("moves the gap onto the line after the caret's own blank line", () => {
    const state = stateOf("Hello\n\n\nworld", 6);
    expect(blankLines(state)).toEqual(["3:cm-mkBlank cm-mkGapTight"]);
  });
});

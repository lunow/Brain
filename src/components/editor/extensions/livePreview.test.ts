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
    // The gap above it is already the tight one it will have once typed in.
    expect(blankLines(stateOf("Hello\n\n", 7))).toEqual(["2:cm-mkBlank cm-mkGapTight"]);
  });

  it("keeps the gap above a new paragraph the same when its first character is typed", () => {
    const empty = stateOf("Hello\n\n", 7);
    const typed = empty.update({ changes: { from: 7, insert: "x" }, selection: EditorSelection.cursor(8) }).state;
    ensureSyntaxTree(typed, typed.doc.length, 5000);
    expect(blankLines(empty)).toEqual(blankLines(typed));
  });

  it("closes off with a loose gap after the caret's paragraph when a heading follows", () => {
    expect(blankLines(stateOf("Hello\n\n\n\n# Next", 7))).toEqual([
      "2:cm-mkBlank cm-mkGapTight",
      "4:cm-mkBlank cm-mkGapLoose",
    ]);
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

/** The text left visible once the replace decorations are applied. */
function visibleText(state: EditorState): string {
  let text = state.doc.toString();
  const hidden: [number, number][] = [];
  state.field(livePreviewField).between(0, state.doc.length, (from, to, deco) => {
    if ((deco.spec as { widget?: unknown }).widget === undefined && deco.point) hidden.push([from, to]);
  });
  for (const [from, to] of hidden.reverse()) text = text.slice(0, from) + text.slice(to);
  return text;
}

/** data-href of each link decoration, in document order. */
function linkHrefs(state: EditorState): string[] {
  const out: string[] = [];
  state.field(livePreviewField).between(0, state.doc.length, (_from, _to, deco) => {
    const href = (deco.spec as { attributes?: Record<string, string> }).attributes?.["data-href"];
    if (href) out.push(href);
  });
  return out;
}

describe("links", () => {
  it("keeps a bare email visible and links it via mailto", () => {
    const state = stateOf("Write to me@example.com today", 0);
    expect(visibleText(state)).toBe("Write to me@example.com today");
    expect(linkHrefs(state)).toEqual(["mailto:me@example.com"]);
  });

  it("keeps bare and angle-bracket URLs visible, hiding only the brackets", () => {
    expect(visibleText(stateOf("see www.example.com", 0))).toBe("see www.example.com");
    expect(visibleText(stateOf("see <https://example.com>", 0))).toBe("see https://example.com");
  });

  it("still hides the url half of a markdown link", () => {
    const state = stateOf("a [site](https://example.com) b", 0);
    expect(visibleText(state)).toBe("a site b");
    expect(linkHrefs(state)).toEqual(["https://example.com"]);
  });
});

describe("hard breaks", () => {
  it("hides Shift-Enter's backslash before and after the new line gets text", () => {
    // "Hello\\\n" with the caret on the empty line Shift-Enter just opened.
    expect(visibleText(stateOf("Hello\\\n", 7))).toBe("Hello\n");
    expect(visibleText(stateOf("Hello\\\nx", 8))).toBe("Hello\nx");
  });

  it("leaves an escaped backslash alone", () => {
    expect(visibleText(stateOf("Hello\\\\\n", 8))).toBe("Hello\\\\\n");
  });

  it("shows a stray trailing backslash once the caret leaves the empty line", () => {
    expect(visibleText(stateOf("Hello\\\n", 0))).toBe("Hello\\\n");
  });
});

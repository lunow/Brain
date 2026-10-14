import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { paragraphKeyBindings, paragraphs, skipSeparator } from "./paragraphs";

function stateOf(doc: string, cursor = doc.length): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), paragraphs],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** Run a key binding against a doc with `|` marking the caret. The vitest
 *  environment has no DOM, so a minimal stand-in for EditorView is enough:
 *  the commands only read `state` and call `dispatch`. */
function press(key: string, marked: string): { doc: string; caret: number } | null {
  const cursor = marked.indexOf("|");
  const view = {
    state: stateOf(marked.replace("|", ""), cursor),
    dispatch(...specs: TransactionSpec[]) {
      this.state = this.state.update(...specs).state;
    },
  };
  const binding = paragraphKeyBindings.find((b) => b.key === key)!;
  const handled = binding.run!(view as unknown as EditorView);
  return handled ? { doc: view.state.doc.toString(), caret: view.state.selection.main.head } : null;
}

describe("Enter", () => {
  it("starts a new paragraph", () => {
    expect(press("Enter", "one|")).toEqual({ doc: "one\n\n", caret: 5 });
  });
  it("splits a paragraph at the caret", () => {
    expect(press("Enter", "ab|cd")).toEqual({ doc: "ab\n\ncd", caret: 4 });
  });
  it("does not stack blank lines on an empty paragraph", () => {
    expect(press("Enter", "one\n\n|")?.doc).toBe("one\n\n");
  });
  it("leaves lists to the default handler", () => {
    expect(press("Enter", "- item|")).toBeNull();
  });
  it("leaves fenced code to the default handler", () => {
    expect(press("Enter", "```\ncode|\n```")).toBeNull();
  });
});

describe("Shift-Enter", () => {
  it("writes a hard break inside a paragraph", () => {
    expect(press("Shift-Enter", "ab|cd")).toEqual({ doc: "ab\\\ncd", caret: 4 });
  });
});

describe("Backspace / Delete", () => {
  it("removes the whole separator at a paragraph start", () => {
    expect(press("Backspace", "one\n\n|two")).toEqual({ doc: "onetwo", caret: 3 });
  });
  it("undoes Enter on an empty paragraph", () => {
    expect(press("Backspace", "one\n\n|")).toEqual({ doc: "one", caret: 3 });
  });
  it("is the default elsewhere", () => {
    expect(press("Backspace", "on|e")).toBeNull();
  });
  it("pulls the next paragraph up", () => {
    expect(press("Delete", "one|\n\ntwo")).toEqual({ doc: "onetwo", caret: 3 });
  });
});

describe("skipSeparator", () => {
  const doc = "one\n\ntwo";
  it("moves forward past the separator", () => {
    expect(skipSeparator(stateOf(doc), 4, 3)).toBe(5);
  });
  it("moves back past the separator", () => {
    expect(skipSeparator(stateOf(doc), 4, 5)).toBe(3);
  });
  it("ignores ordinary lines", () => {
    expect(skipSeparator(stateOf(doc), 1, 0)).toBeNull();
  });
});

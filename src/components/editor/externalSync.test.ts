import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { minimalReplacement } from "./externalSync";

function applied(current: string, next: string): string {
  const replacement = minimalReplacement(current, next);
  if (!replacement) return current;
  return current.slice(0, replacement.from) + replacement.insert + current.slice(replacement.to);
}

describe("minimalReplacement", () => {
  it("reports no change for identical content", () => {
    expect(minimalReplacement("# Title\nbody\n", "# Title\nbody\n")).toBeNull();
  });

  it("touches only the differing middle", () => {
    const current = "# Title\n\nfirst\nsecond\nthird\n";
    const next = "# Title\n\nfirst\nSECOND\nthird\n";
    expect(minimalReplacement(current, next)).toEqual({ from: 15, to: 21, insert: "SECOND" });
  });

  it.each([
    ["insertion at the end", "a\nb\n", "a\nb\nc\n"],
    ["insertion at the start", "b\nc\n", "a\nb\nc\n"],
    ["deletion in the middle", "a\nb\nc\n", "a\nc\n"],
    ["full rewrite", "old text", "entirely different"],
    ["emptied file", "something\n", ""],
    ["filled from empty", "", "something\n"],
    ["repeated lines", "x\nx\nx\n", "x\nx\n"],
  ])("round-trips %s", (_label, current, next) => {
    expect(applied(current, next)).toBe(next);
  });

  it("never splits a surrogate pair", () => {
    const current = "hi 😀 there";
    const next = "hi 😁 there";
    const replacement = minimalReplacement(current, next);
    expect(replacement).not.toBeNull();
    // The boundary would otherwise land between the shared high surrogate and
    // the differing low surrogate, leaving a lone surrogate behind.
    expect(replacement!.insert).toBe("😁");
    expect(applied(current, next)).toBe(next);
  });

  it("maps a selection after the change through unmoved", () => {
    const current = "intro\nmiddle\nend of the file\n";
    const next = "intro\nMIDDLE\nend of the file\n";
    const state = EditorState.create({
      doc: current,
      selection: EditorSelection.cursor(current.indexOf("end of the file")),
    });
    const tr = state.update({ changes: minimalReplacement(current, next)! });
    expect(tr.state.doc.toString()).toBe(next);
    expect(tr.state.selection.main.head).toBe(next.indexOf("end of the file"));
  });
});

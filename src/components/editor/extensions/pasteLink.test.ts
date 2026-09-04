import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { handlePasteLink } from "./pasteLink";

/** Minimal ClipboardEvent stand-in; jsdom isn't loaded in this test env. */
function pasteEvent(text: string) {
  let prevented = false;
  return {
    clipboardData: { getData: () => text },
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  } as unknown as ClipboardEvent;
}

/** Minimal EditorView stand-in exposing just what handlePasteLink reads. */
function fakeView(doc: string, anchor: number, head = anchor) {
  let state = EditorState.create({ doc, selection: EditorSelection.range(anchor, head) });
  return {
    get state() {
      return state;
    },
    dispatch(tr: { state: EditorState }) {
      state = tr.state;
    },
  } as unknown as import("@codemirror/view").EditorView & { state: EditorState };
}

describe("handlePasteLink", () => {
  it("wraps the selection as a markdown link instead of replacing it", () => {
    const view = fakeView("see example please", 4, 11); // "example"
    const event = pasteEvent("https://example.com");
    const handled = handlePasteLink(event, view);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("see [example](https://example.com) please");
  });

  it("leaves a collapsed cursor's default paste behavior alone by inserting the raw URL", () => {
    const view = fakeView("see  please", 4);
    const handled = handlePasteLink(pasteEvent("https://example.com"), view);
    expect(handled).toBe(false);
    // Cursor case falls through to CodeMirror's own paste handling.
    expect(view.state.doc.toString()).toBe("see  please");
  });

  it("does not intercept pasting non-URL text over a selection", () => {
    const view = fakeView("see example please", 4, 11);
    const handled = handlePasteLink(pasteEvent("just some words"), view);
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("see example please");
  });

  it("treats a local file path (no scheme) as non-URL and falls through", () => {
    const view = fakeView("see example please", 4, 11);
    const handled = handlePasteLink(pasteEvent("/Users/me/notes/todo.md"), view);
    expect(handled).toBe(false);
  });

  it("wraps mailto: links too", () => {
    const view = fakeView("contact me", 8, 10); // "me"
    const handled = handlePasteLink(pasteEvent("mailto:me@example.com"), view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe("contact [me](mailto:me@example.com)");
  });
});

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Same "scheme:" prefix test mdLink.ts uses to distinguish a URL/URI from
// plain pasted text. Anchoring to the end with \S+ also rules out anything
// containing whitespace, so multi-line or prose clipboard content never
// matches.
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/;

/**
 * Pasting a URL over a selection turns the selected text into a markdown
 * link (`[selection](url)`) rather than replacing it with the URL — the
 * "select text, paste link" flow common to rich text editors. livePreview.ts
 * then renders that as a clickable `cm-mkLink` span (see mdLink.ts for the
 * Cmd/Ctrl-click handling).
 *
 * Pasting over a collapsed cursor, or pasting anything that isn't a bare
 * URL, falls through to CodeMirror's default paste handling.
 *
 * Exported standalone (rather than only as the domEventHandlers extension
 * below) so it can be unit-tested against a plain EditorState without
 * mounting a real EditorView/DOM.
 */
export function handlePasteLink(event: ClipboardEvent, view: EditorView): boolean {
  const url = event.clipboardData?.getData("text/plain")?.trim();
  if (!url || !SCHEME_PATTERN.test(url)) return false;
  if (view.state.selection.ranges.every((range) => range.empty)) return false;

  event.preventDefault();
  const tr = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: url },
        range: EditorSelection.cursor(range.from + url.length),
      };
    }
    const selected = view.state.doc.sliceString(range.from, range.to);
    const insert = `[${selected}](${url})`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });
  view.dispatch(view.state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
}

export const pasteLinkHandler = EditorView.domEventHandlers({ paste: handlePasteLink });

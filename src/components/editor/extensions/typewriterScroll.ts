import type { EditorView } from "@codemirror/view";

const TYPEWRITER_FRACTION = 0.6;

/**
 * Keeps the active line pinned near `fraction` of the scroll parent's
 * height as the cursor moves — a "typewriter" scroll effect. CodeMirror
 * itself doesn't scroll here (see editorTheme's `.cm-scroller { overflow:
 * visible }`); the real scrollable ancestor is FileEditor's `.scrollArea`,
 * passed in as `scrollParent`.
 *
 * Only called from selection/doc-change updates (see MarkdownEditor), so a
 * reader freely scrolling `.scrollArea` with the mouse — without moving the
 * cursor — is never fought.
 */
export function scrollCursorToFraction(
  view: EditorView,
  scrollParent: HTMLElement | null,
  fraction: number = TYPEWRITER_FRACTION,
) {
  if (!scrollParent) return;
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (!coords) return;

  const parentRect = scrollParent.getBoundingClientRect();
  const cursorY = coords.top - parentRect.top;
  const targetY = parentRect.height * fraction;
  const delta = cursorY - targetY;

  // Browsers clamp scrollTop to [0, scrollHeight - clientHeight] on their
  // own, so early lines that can't reach 60% (not enough content above)
  // simply stay put rather than needing special-casing here.
  if (Math.abs(delta) > 1) {
    scrollParent.scrollTop += delta;
  }
}

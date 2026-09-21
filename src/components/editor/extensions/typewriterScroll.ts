import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Transaction } from "@codemirror/state";

/**
 * Typewriter scroll: while the user is typing, keep the cursor's line at the
 * screen position it had when they started typing. CodeMirror itself doesn't
 * scroll here (see editorTheme's `.cm-scroller { overflow: visible }`); the
 * real scrollable ancestor is FileEditor's `.scrollArea`, resolved through
 * `getScrollParent` on every update.
 *
 * A "typing flow" starts with the first typed keystroke after anything else
 * (a click, arrow keys, a mouse scroll, undo, paste, …) and anchors the
 * cursor's on-screen Y at that moment. Subsequent keystrokes in the flow that
 * move the cursor to another visual row — Enter, a wrapping line, Backspace
 * joining lines — scroll the parent by exactly that row delta so the cursor
 * stays where it was. Typing within one row changes nothing, so quick fixes
 * here and there never scroll, and there is no fixed "60% of the viewport"
 * target: wherever the user scrolled the line to before typing is where it
 * stays.
 *
 * Any non-typing transaction or a scroll the plugin didn't cause itself ends
 * the flow; the next keystroke re-anchors at the cursor's then-current Y,
 * which by construction produces no jump.
 */
export function typewriterScroll(getScrollParent: () => HTMLElement | null) {
  return ViewPlugin.fromClass(
    class {
      private anchorY: number | null = null;
      /** scrollTop right after our own scroll, so the scroll listener can tell
       *  the user's wheel/trackpad scrolling from ours. */
      private expectedScrollTop: number | null = null;
      private scrollParent: HTMLElement | null;

      constructor(readonly view: EditorView) {
        this.scrollParent = getScrollParent();
        this.scrollParent?.addEventListener("scroll", this.onScroll, { passive: true });
      }

      private onScroll = () => {
        const parent = this.scrollParent;
        if (!parent) return;
        if (this.expectedScrollTop !== null && Math.abs(parent.scrollTop - this.expectedScrollTop) <= 1) {
          this.expectedScrollTop = null;
          return;
        }
        // The user (or CodeMirror's own scrollIntoView) moved the page: the
        // cursor's on-screen position is now theirs to decide, so drop the
        // anchor and let the next keystroke pick it up fresh.
        this.anchorY = null;
        this.expectedScrollTop = null;
      };

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return;
        if (!update.transactions.every(isTypingTransaction)) {
          this.anchorY = null;
          return;
        }
        // `update()` runs before CodeMirror has touched the DOM, and reading
        // layout here throws ("Reading the editor layout isn't allowed during
        // an update") — which deactivates the plugin. Defer to the measure
        // phase, where the new DOM is in place and reads/writes are legal.
        update.view.requestMeasure(this.measure);
      }

      private measure = {
        key: this,
        read: (view: EditorView): number | null => {
          const parent = getScrollParent();
          if (!parent) return null;
          if (parent !== this.scrollParent) {
            this.scrollParent?.removeEventListener("scroll", this.onScroll);
            this.scrollParent = parent;
            parent.addEventListener("scroll", this.onScroll, { passive: true });
          }
          const coords = view.coordsAtPos(view.state.selection.main.head);
          if (!coords) return null;
          return coords.top - parent.getBoundingClientRect().top;
        },
        write: (cursorY: number | null) => {
          const parent = this.scrollParent;
          if (cursorY === null || !parent) return;

          if (this.anchorY === null) {
            this.anchorY = cursorY;
            return;
          }

          const delta = cursorY - this.anchorY;
          // Browsers clamp scrollTop to [0, scrollHeight - clientHeight] on
          // their own, so near the top or bottom of the document the line
          // simply stays put rather than needing special-casing here.
          if (Math.abs(delta) > 1) {
            parent.scrollTop += delta;
            this.expectedScrollTop = parent.scrollTop;
          }
        },
      };

      destroy() {
        this.scrollParent?.removeEventListener("scroll", this.onScroll);
      }
    },
  );
}

/** Keystroke-driven edits that belong to a typing flow. Everything else —
 *  clicks and keyboard cursor movement ("select.*", "move.*"), paste/drop,
 *  undo/redo, table-cell commits ("input.table", whose selection is stale —
 *  see tableWidget.ts), programmatic dispatches without a user event —
 *  ends the flow instead. */
function isTypingTransaction(tr: Transaction): boolean {
  if (tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop") || tr.isUserEvent("input.table")) {
    return false;
  }
  return tr.isUserEvent("input") || tr.isUserEvent("delete");
}

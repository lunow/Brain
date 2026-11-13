import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Transaction } from "@codemirror/state";

/**
 * Typewriter scroll: while the user is typing, keep the cursor's line at the
 * screen position it had when they started typing. CodeMirror itself doesn't
 * scroll here (see editorTheme's `.cm-scroller { overflow: visible }`); the
 * real scrollable ancestor is FileEditor's `.scrollArea`, resolved through
 * `getScrollParent` on every update.
 *
 * A "typing flow" starts with the first keystroke after anything else (a
 * click, arrow keys, a mouse scroll, undo, paste, …) and anchors the cursor's
 * on-screen Y as it was *before* that keystroke applied — otherwise a flow
 * opened by Enter would anchor on the new row and the line would visibly jump
 * once. Keystrokes in the flow that move the cursor to another visual row —
 * Enter, a wrapping line, Backspace joining lines — scroll the parent by
 * exactly that row delta so the cursor stays where it was. Typing within one
 * row changes nothing, so quick fixes here and there never scroll, and there
 * is no fixed "60% of the viewport" target: wherever the user scrolled the
 * line to before typing is where it stays. In fullscreen that can be anywhere
 * on screen, even for a document's first or last line — see
 * useTypewriterOverscroll.
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

      /** Runs before CodeMirror applies the key, while the cursor is still
       *  where the user put it. A key that turns out not to type anything
       *  clears this again through update(). */
      keydown() {
        if (this.anchorY === null) this.anchorY = this.cursorY(this.view);
      }

      private cursorY(view: EditorView): number | null {
        const parent = getScrollParent();
        if (!parent) return null;
        if (parent !== this.scrollParent) {
          this.scrollParent?.removeEventListener("scroll", this.onScroll);
          this.scrollParent = parent;
          parent.addEventListener("scroll", this.onScroll, { passive: true });
        }
        // Where a line wraps, one position is both the end of a row and the
        // start of the next; assoc says which of the two the caret is drawn
        // on (the End key puts it on the former).
        const { head, assoc } = view.state.selection.main;
        const coords = view.coordsAtPos(head, assoc || 1);
        if (!coords) return null;
        return coords.top - parent.getBoundingClientRect().top;
      }

      private measure = {
        key: this,
        read: (view: EditorView): number | null => this.cursorY(view),
        write: (cursorY: number | null) => {
          const parent = this.scrollParent;
          if (cursorY === null || !parent) return;

          // No keydown came first (dictation, a composition commit): the
          // best remaining reference is where the cursor is now.
          if (this.anchorY === null) {
            this.anchorY = cursorY;
            return;
          }

          const delta = cursorY - this.anchorY;
          // Only a move to another visual row is worth a scroll, and a row is
          // at least a line tall. Anything smaller is the caret being measured
          // differently, not moving: an empty line's caret comes from its
          // line box, a typed one's from the glyph, and the two sit a couple
          // of pixels apart. Scrolling for that would nudge every line above
          // on the first keystroke of a new paragraph, so take the new
          // position as the anchor instead.
          if (Math.abs(delta) < this.view.defaultLineHeight / 2) {
            this.anchorY = cursorY;
            return;
          }
          // Browsers clamp scrollTop to [0, scrollHeight - clientHeight] on
          // their own, so near the top or bottom of the document the line
          // simply stays put rather than needing special-casing here.
          parent.scrollTop += delta;
          this.expectedScrollTop = parent.scrollTop;
        },
      };

      destroy() {
        this.scrollParent?.removeEventListener("scroll", this.onScroll);
      }
    },
    {
      // An observer, not a handler: observers run ahead of the keymap, and a
      // handler would never see the keys a binding claims — Enter among them.
      eventObservers: {
        keydown() {
          this.keydown();
        },
      },
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

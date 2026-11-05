import { useEffect, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";

/**
 * Makes room to park any line anywhere on screen before typing. Without it the
 * document's edges pin the scroll range: the first lines can't leave the top
 * of the screen and the last ones can't leave the bottom, so typewriter scroll
 * (extensions/typewriterScroll.ts) has nothing to hold on to at either end of
 * a document — which is where most new writing happens.
 *
 * Adds one screenful of blank paper above and below the text (see editor.css)
 * and scrolls past the top one, so the text doesn't move when this switches on
 * and the extra space only appears when scrolled to.
 *
 * Keyed on the live editor (null when off) rather than a flag: the padding sits
 * on the editor's own content, so a rebuilt editor — another file, StrictMode's
 * double mount — collapses the scroll range and the offset has to be reapplied.
 */
export function useTypewriterOverscroll(scrollAreaRef: RefObject<HTMLElement | null>, view: EditorView | null) {
  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!view || !area) return;

    const overscroll = area.clientHeight;
    area.style.setProperty("--typewriter-overscroll", `${overscroll}px`);
    area.scrollTop += overscroll;

    return () => {
      // In this order: while the blank paper is still there, the browser has
      // no reason to clamp the position the way it would once it's gone.
      area.scrollTop -= overscroll;
      area.style.removeProperty("--typewriter-overscroll");
    };
  }, [scrollAreaRef, view]);
}

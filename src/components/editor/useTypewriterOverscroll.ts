import { useEffect, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";

/**
 * Makes room to park any line anywhere on screen before typing. Without it the
 * document's edges pin the scroll range: the first lines can't leave the top
 * of the screen and the last ones can't leave the bottom, so typewriter scroll
 * (extensions/typewriterScroll.ts) has nothing to hold on to at either end of
 * a document — which is where most new writing happens.
 *
 * Adds one screenful of canvas above and below the sheet (margin on
 * FileEditor's .widthContainer, outside the paper so the sheet keeps its own
 * size — like sliding a piece of paper around the desk) and scrolls past the
 * top one, so the text doesn't move when this switches on and the extra space
 * only appears when scrolled to. Clicks out there still reach the text: see
 * FileEditor's handleCanvasMouseDown.
 *
 * Keyed on the live editor (null when off) so it follows the scroll area the
 * editor is mounted in, which is rebuilt while another file loads.
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

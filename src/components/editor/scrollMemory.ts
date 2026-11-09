import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/**
 * Where the open file was scrolled to, so a restart opens it at the same
 * place (the file itself is remembered by the workspace store).
 *
 * Stored as a point in the text — the first character visible at the top of
 * the scroll area and how far below that edge its row sat — rather than as a
 * scrollTop. A pixel offset only holds for the same window size, type size,
 * and layout; the A4 page breaks, for one, arrive a frame after the text and
 * push everything below the first page down.
 */

const STORAGE_KEY = "write:lastScroll";

export interface ScrollAnchor {
  path: string;
  /** Document position of the first visible row. */
  pos: number;
  /** That row's top, in px below the top of the scroll area. */
  offset: number;
}

export function loadScrollAnchor(): ScrollAnchor | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScrollAnchor>;
    if (typeof parsed.path !== "string" || typeof parsed.pos !== "number" || typeof parsed.offset !== "number") {
      return null;
    }
    return { path: parsed.path, pos: parsed.pos, offset: parsed.offset };
  } catch {
    return null;
  }
}

export function saveScrollAnchor(anchor: ScrollAnchor) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor));
  } catch {
    // Storage unavailable — the file just opens at the top next time.
  }
}

/** The anchor for what `area` shows of `view` right now. */
export function captureScrollAnchor(view: EditorView, area: HTMLElement, path: string): ScrollAnchor | null {
  const areaTop = area.getBoundingClientRect().top;
  const content = view.contentDOM.getBoundingClientRect();
  // Above the text (the sheet's top margin, fullscreen's blank screenful)
  // the first visible row is the document's first.
  const y = Math.min(Math.max(areaTop + 1, content.top + 1), content.bottom - 1);
  const pos = view.posAtCoords({ x: content.left + 1, y }, false);
  const coords = view.coordsAtPos(pos, 1);
  if (!coords) return null;
  return { path, pos, offset: coords.top - areaTop };
}

/** How long after arriving the restore keeps correcting for layout that
 *  settles late (heights CodeMirror only measures once drawn, A4 breaks). */
const SETTLE_MS = 1500;
/** The longest the text stays hidden if the walk down never finishes. */
const WALK_LIMIT_MS = 3000;

/**
 * Scrolls `getScrollParent()` so `anchor` sits where it was saved, and keeps
 * it there while the layout settles — for SETTLE_MS after arriving, or until
 * the user scrolls, clicks or types.
 *
 * Gets there by walking down from the top a screen at a time with the text
 * hidden, rather than jumping. CodeMirror only measures lines it has drawn
 * and estimates the rest, and the A4 page breaks are laid out from those
 * heights: jump straight to page 12 and pages 1–11 are guesses, so the
 * breaks land somewhere else than they did when the position was saved, and
 * move again as you scroll up. Walking draws (and so measures) every line
 * above the anchor on the way, which takes a frame per screen.
 */
export function restoreScroll(anchor: Pick<ScrollAnchor, "pos" | "offset">, getScrollParent: () => HTMLElement | null) {
  return ViewPlugin.fromClass(
    class {
      private done = false;
      private revealed = false;
      private readonly parent = getScrollParent();
      private timer: ReturnType<typeof setTimeout>;
      private frame = 0;

      constructor(readonly view: EditorView) {
        this.parent?.addEventListener("wheel", this.stop, { passive: true });
        this.parent?.addEventListener("pointerdown", this.stop);
        view.dom.addEventListener("keydown", this.stop);
        this.timer = setTimeout(this.stop, WALK_LIMIT_MS);
        if (anchor.pos > 0) view.dom.style.visibility = "hidden";
        else this.reveal();
        this.scheduleNextFrame();
      }

      private reveal() {
        if (this.revealed) return;
        this.revealed = true;
        this.view.dom.style.visibility = "";
        clearTimeout(this.timer);
        this.timer = setTimeout(this.stop, SETTLE_MS);
      }

      private stop = () => {
        if (this.done) return;
        this.done = true;
        this.reveal();
        clearTimeout(this.timer);
        this.parent?.removeEventListener("wheel", this.stop);
        this.parent?.removeEventListener("pointerdown", this.stop);
        this.view.dom.removeEventListener("keydown", this.stop);
      };

      update(update: ViewUpdate) {
        if (this.done) return;
        if (update.heightChanged || update.geometryChanged || update.viewportChanged || update.docChanged) {
          this.scheduleNextFrame();
        }
      }

      /** Measures on the next frame rather than from inside update(). An
       *  update can come from CodeMirror's own measure loop, where a fresh
       *  request restarts the loop; while this is scrolling it restarts it
       *  every round, CodeMirror gives up after five ("Measure loop
       *  restarted more than 5 times") and the requests left over then
       *  never run in an editor that's otherwise idle. */
      private scheduleNextFrame() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          this.schedule();
        });
      }

      private schedule() {
        this.view.requestMeasure({
          key: this,
          read: (view) => {
            const parent = this.parent;
            if (!parent || this.done) return null;
            const pos = Math.min(anchor.pos, view.state.doc.length);
            // Drawn: the row's real position. Not drawn yet (further down
            // than the walk has got): the height map's estimate.
            const coords = view.coordsAtPos(pos, 1);
            const top = coords ? coords.top : view.documentTop + view.lineBlockAt(pos).top;
            return { delta: top - parent.getBoundingClientRect().top - anchor.offset, drawn: !!coords };
          },
          write: (result) => {
            const parent = this.parent;
            if (!result || !parent || this.done) return;
            const { delta } = result;
            if (!this.revealed && delta > parent.clientHeight) {
              // One screen further down. CodeMirror draws what's newly in
              // view on its next measure; carry on from there, whether or
              // not that changes its viewport enough to send an update.
              const before = parent.scrollTop;
              parent.scrollTop += parent.clientHeight;
              if (parent.scrollTop === before) this.reveal(); // hit the bottom
              else this.scheduleNextFrame();
              return;
            }
            if (Math.abs(delta) >= 1) parent.scrollTop += delta;
            if (result.drawn) this.reveal();
            else this.scheduleNextFrame();
          },
        });
      }

      destroy() {
        cancelAnimationFrame(this.frame);
        this.stop();
      }
    },
  );
}

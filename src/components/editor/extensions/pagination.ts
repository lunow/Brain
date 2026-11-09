import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/**
 * A4 pages in the editor: the text runs on separate sheets with the canvas
 * showing between them, so the length of a document is visible as paper
 * rather than written out as a number.
 *
 * The sheet itself is FileEditor's `.widthContainer` on the A4 preset, whose
 * padding is the page margin (--a4-margin) all round. This extension cuts
 * that one long sheet into pages: before the first line that no longer fits
 * on a page it inserts a break widget as tall as the rest of that page's text
 * area, its bottom margin, the gap, and the next page's top margin — the gap
 * painted in the canvas colour across the sheet's full width. Padding below
 * the last line fills the last page out to a whole sheet.
 *
 * Pages break between lines, never inside one: CodeMirror can only put block
 * widgets between lines, and a paragraph is one line however many rows it
 * wraps to. A paragraph that doesn't fit moves to the next page whole, the
 * way "keep lines together" works in a word processor. A single block taller
 * than a page (a long table) gets a sheet of its own that's taller than A4.
 *
 * Heights come from CodeMirror's height map, so lines it hasn't drawn yet are
 * estimates, and the pages further down settle as they scroll into view.
 */

/** Matches the PDF export (src/lib/markdownToPdf.ts) and --a4-* in typography.css. */
const A4_HEIGHT_PT = 841.89;
const A4_MARGIN_PT = 56;
const PDF_BODY_PT = 10.5;
/** Canvas between two sheets, in screen pixels. */
const PAGE_GAP_PX = 28;

interface PageBreak {
  /** Start of the first line on the new page. */
  pos: number;
  height: number;
}

interface Layout {
  breaks: PageBreak[];
  /** Blank paper below the last line, filling out the last page. */
  fill: number;
  /** Page margin in px (--a4-margin at the current type size). */
  margin: number;
}

const EMPTY_LAYOUT: Layout = { breaks: [], fill: 0, margin: 0 };

export const setPaged = StateEffect.define<boolean>();
const setLayout = StateEffect.define<Layout>();

class PageBreakWidget extends WidgetType {
  constructor(
    readonly height: number,
    readonly margin: number,
  ) {
    super();
  }

  eq(other: PageBreakWidget) {
    return Math.abs(other.height - this.height) < 0.5 && Math.abs(other.margin - this.margin) < 0.5;
  }

  toDOM() {
    const dom = document.createElement("div");
    dom.className = "cm-pageBreak";
    dom.setAttribute("aria-hidden", "true");
    dom.style.height = `${this.height}px`;
    // The gap sits one top margin above the next page's first line.
    const gap = dom.appendChild(document.createElement("div"));
    gap.className = "cm-pageGap";
    gap.style.height = `${PAGE_GAP_PX}px`;
    gap.style.bottom = `${this.margin}px`;
    return dom;
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = `${this.height}px`;
    (dom.firstElementChild as HTMLElement).style.bottom = `${this.margin}px`;
    return true;
  }

  get estimatedHeight() {
    return this.height;
  }

  ignoreEvent() {
    return false;
  }
}

interface PagingState {
  enabled: boolean;
  layout: Layout;
}

const pagingField = StateField.define<PagingState>({
  create: () => ({ enabled: false, layout: EMPTY_LAYOUT }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPaged)) {
        value = { ...value, enabled: effect.value, layout: EMPTY_LAYOUT };
      } else if (effect.is(setLayout) && value.enabled) {
        value = { ...value, layout: effect.value };
      }
    }
    if (!tr.docChanged || value.layout.breaks.length === 0) return value;
    // Keep the pages roughly in place until the next measure recomputes
    // them, dropping any break an edit moved off the start of a line (a
    // block widget can only sit between lines).
    const breaks: PageBreak[] = [];
    for (const b of value.layout.breaks) {
      const pos = tr.changes.mapPos(b.pos, -1);
      if (pos > 0 && tr.state.doc.lineAt(pos).from === pos && breaks[breaks.length - 1]?.pos !== pos) {
        breaks.push({ pos, height: b.height });
      }
    }
    return { ...value, layout: { ...value.layout, breaks } };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value): DecorationSet => {
      if (!value.enabled) return Decoration.none;
      return Decoration.set(
        value.layout.breaks.map((b) =>
          Decoration.widget({ widget: new PageBreakWidget(b.height, value.layout.margin), block: true, side: -1 }).range(b.pos),
        ),
      );
    }),
    EditorView.contentAttributes.from(field, (value) =>
      ({ style: `padding-bottom: ${value.enabled ? value.layout.fill : 0}px` }),
    ),
  ],
});

/** The editor's body text is drawn at the size of the PDF's 10.5pt (see
 *  --a4-point), so one PDF point is this many pixels. */
function readPointPx(view: EditorView): number {
  return parseFloat(getComputedStyle(view.dom).fontSize) / PDF_BODY_PT;
}

function computeLayout(view: EditorView, pointPx: number): Layout {
  const margin = A4_MARGIN_PT * pointPx;
  const textHeight = A4_HEIGHT_PT * pointPx - 2 * margin;
  const { doc } = view.state;
  const existing = new Map(view.state.field(pagingField).layout.breaks.map((b) => [b.pos, b.height]));

  const breaks: PageBreak[] = [];
  let used = 0;
  let pos = 0;
  for (;;) {
    const block = view.lineBlockAt(pos);
    // A break widget at this line counts toward the line's own block; take
    // it out so the layout is computed from the text alone and the answer
    // doesn't depend on where the previous pass put the breaks.
    const widget = Array.isArray(block.type) ? (existing.get(block.from) ?? 0) : 0;
    const height = Math.max(0, block.height - widget);
    const blank = block.from === block.to || doc.sliceString(block.from, block.to).trim() === "";

    if (used > 0 && used + height > textHeight) {
      if (blank && used + height - textHeight < margin) {
        // Blank lines spill into the bottom margin rather than starting a
        // page with empty space above its first line.
        used += height;
      } else {
        // A spilled blank line (used > textHeight) comes out of the margin.
        breaks.push({ pos: block.from, height: textHeight - used + 2 * margin + PAGE_GAP_PX });
        used = height;
      }
    } else {
      used += height;
    }

    if (block.to >= doc.length) break;
    pos = block.to + 1;
  }

  return { breaks, fill: Math.max(0, textHeight - used), margin };
}

function sameLayout(a: Layout, b: Layout): boolean {
  if (Math.abs(a.fill - b.fill) >= 0.5 || Math.abs(a.margin - b.margin) >= 0.5 || a.breaks.length !== b.breaks.length) return false;
  return a.breaks.every((x, i) => x.pos === b.breaks[i].pos && Math.abs(x.height - b.breaks[i].height) < 0.5);
}

const paginationPlugin = ViewPlugin.fromClass(
  class {
    private pending = false;
    /** The layout the last dispatch replaced, and the content width then.
     *  See the flip-flop guard in write(). */
    private replaced: Layout | null = null;
    private width = 0;
    private frame = 0;

    constructor(readonly view: EditorView) {
      this.scheduleNextFrame();
    }

    update(update: ViewUpdate) {
      const toggled = update.transactions.some((tr) => tr.effects.some((e) => e.is(setPaged)));
      if (!update.state.field(pagingField).enabled) return;
      if (toggled || update.docChanged) this.replaced = null;
      if (toggled || update.docChanged || update.heightChanged || update.geometryChanged || update.viewportChanged) {
        this.scheduleNextFrame();
      }
    }

    /** On the next frame rather than straight from update(), which can run
     *  inside CodeMirror's measure loop: a request made there restarts the
     *  loop, and after five restarts CodeMirror drops what's left over. */
    private scheduleNextFrame() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.schedule();
      });
    }

    destroy() {
      cancelAnimationFrame(this.frame);
    }

    private schedule() {
      this.view.requestMeasure({
        key: this,
        read: (view) => {
          if (!view.state.field(pagingField).enabled) return null;
          return { layout: computeLayout(view, readPointPx(view)), width: view.contentDOM.clientWidth };
        },
        write: (result) => {
          if (!result || this.pending) return;
          const { layout, width } = result;
          if (width !== this.width) {
            this.width = width;
            this.replaced = null;
          }
          const current = this.view.state.field(pagingField).layout;
          if (sameLayout(layout, current)) return;
          // Flip-flop guard. Lines CodeMirror hasn't drawn share one height
          // estimate per stretch, and a break placed inside a stretch splits
          // it and redistributes that estimate, so the next pass reads other
          // heights and can put the break back — every frame, forever.
          // Going straight back to the layout just replaced is that loop,
          // unless the text or the width changed in between (both clear it).
          if (this.replaced && sameLayout(layout, this.replaced)) return;
          this.replaced = current;
          // Dispatching isn't allowed while the view is measuring; right
          // after this frame's measure pass is the earliest it can go out.
          this.pending = true;
          queueMicrotask(() => {
            this.pending = false;
            if (this.view.state.field(pagingField).enabled) this.view.dispatch({ effects: setLayout.of(layout) });
          });
        },
      });
    }
  },
);

/** Off until a `setPaged.of(true)` effect (or `initiallyPaged`) turns it on. */
export function pagination(initiallyPaged: boolean): Extension {
  return [pagingField.init(() => ({ enabled: initiallyPaged, layout: EMPTY_LAYOUT })), paginationPlugin];
}

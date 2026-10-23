import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { CodeBlockWidget } from "./codeBlockWidget";
import { FrontmatterWidget } from "./frontmatterWidget";
import { MermaidWidget } from "./mermaidWidget";
import { TableWidget } from "./tableWidget";
import { collectSmartTypographyDecorations } from "./smartTypographyIntegration";
import { collectPathLinkDecorations } from "./pathLink";
import { topLevelBlockAt } from "./paragraphs";

/**
 * WYSIWYG-style "live preview": the document stays plain-text markdown at
 * all times (this is a pure view-layer decoration pass over the Lezer
 * syntax tree CM6 already builds, never mutating the buffer). Raw inline
 * delimiters (`**`, `#`, link brackets, ...) are always hidden in favor of
 * styled content — including on the line the cursor is on — so moving the
 * cursor in and out of formatted text never reflows the line. The hidden
 * marks are real (zero-width) document ranges, so clicking into formatted
 * text still places the cursor in the real text between them, and typing
 * markdown syntax by hand still works: as soon as a construct parses (e.g.
 * the closing `**`), its marks collapse immediately rather than waiting for
 * the cursor to leave the line. Toggling formatting on a selection (bold,
 * italic) is expected to go through the Mod-b/Mod-i commands in
 * MarkdownEditor.tsx rather than requiring the marks to be manually typed
 * or deleted while hidden.
 *
 * Fenced code blocks and tables are a different story: editing their
 * contents needs the raw source visible, so those still gate on
 * isLineRangeActive and swap between a rendered widget and raw text.
 *
 * This must be a StateField rather than a ViewPlugin: fenced code blocks
 * and horizontal rules render as block-level widgets, and CM6 requires
 * block decorations to come from a StateField (RangeError otherwise).
 * That means decorations are computed over the whole document rather than
 * just the viewport — fine at the document sizes this app targets.
 */

class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-mkHr";
    return hr;
  }
  eq() {
    return true;
  }
}

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-mkH1",
  ATXHeading2: "cm-mkH2",
  ATXHeading3: "cm-mkH3",
  ATXHeading4: "cm-mkH4",
  ATXHeading5: "cm-mkH5",
  ATXHeading6: "cm-mkH6",
};

/** Companion to HEADING_CLASS, applied to the heading's whole LINE rather
 *  than to the heading text. HEADING_CLASS lands on an inline span, which
 *  can't carry vertical space — a block-level line decoration can, and
 *  that's what gives a heading more room above it than below (see the
 *  .cm-mkHeadingLine rules in editor.css). */
const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-mkHeadingLine cm-mkHeadingLine1",
  ATXHeading2: "cm-mkHeadingLine cm-mkHeadingLine2",
  ATXHeading3: "cm-mkHeadingLine cm-mkHeadingLine3",
  ATXHeading4: "cm-mkHeadingLine cm-mkHeadingLine4",
  ATXHeading5: "cm-mkHeadingLine cm-mkHeadingLine5",
  ATXHeading6: "cm-mkHeadingLine cm-mkHeadingLine6",
};

function isLineRangeActive(state: EditorState, from: number, to: number): boolean {
  const lineFrom = state.doc.lineAt(from).from;
  const lineTo = state.doc.lineAt(to).to;
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true;
  }
  return false;
}

interface PendingDecoration {
  from: number;
  to: number;
  deco: Decoration;
  /** Line decorations must be emitted before any other decoration starting
   *  at the same offset, or RangeSetBuilder rejects the set as unsorted. */
  isLine?: boolean;
}


interface BlankLineRun {
  /** Line numbers of the first and last blank line of the run, inclusive. */
  from: number;
  to: number;
  /** The run is followed by a paragraph, so it separates two paragraphs of
   *  one block of thought and gets the tighter gap. */
  leadsIntoParagraph: boolean;
}

/**
 * Paragraph spacing: the blank lines BETWEEN blocks are never shown as
 * lines. Each one collapses to nothing, and the first of a run becomes a
 * gap of paragraph-sized space instead (caret handling for these lines
 * lives in paragraphs.ts). A run of paragraphs reads as one
 * block of thought and gets the tighter gap; the last paragraph before
 * something else (a heading, a list, the end of the document) gets more
 * room to close the group off.
 *
 * The one exception is an empty line the caret is sitting on — a paragraph
 * that was just started with Enter — which stays a full line so there is
 * somewhere to see the caret. Only blank lines that actually separate
 * top-level blocks are touched; a blank line inside fenced code,
 * frontmatter, a table or a quote is real content and left alone.
 *
 * Runs of blank lines are handled as a unit. Looking ahead from every blank
 * line individually made this quadratic in the length of a run: 2000
 * consecutive blank lines (hold Enter, or padding at the end of a pasted
 * file) cost ~164ms per rebuild, and this rebuilds on every keystroke and
 * every cursor move. Skipping the loop past each run makes it linear, and
 * resolving the block type once per run rather than once per line drops the
 * tree lookups from one-per-blank-line to one-per-gap. A run cannot
 * straddle a block boundary — the delimiter that would end a block is
 * itself a non-blank line — so one lookup describes the whole run.
 */
function collectBlankLineRuns(state: EditorState): BlankLineRun[] {
  const runs: BlankLineRun[] = [];
  const lineCount = state.doc.lines;
  const isBlank = (n: number) => state.doc.line(n).text.trim().length === 0;

  for (let i = 1; i <= lineCount; i++) {
    if (!isBlank(i)) continue;

    // Extent of this run of blank lines, and the block it sits in, found once.
    let next = i + 1;
    while (next <= lineCount && isBlank(next)) next++;

    if (topLevelBlockAt(state, state.doc.line(i).from) === "Document") {
      runs.push({
        from: i,
        to: next - 1,
        leadsIntoParagraph:
          next <= lineCount && topLevelBlockAt(state, state.doc.line(next).from) === "Paragraph",
      });
    }

    i = next - 1; // the loop's own i++ lands on `next`
  }

  return runs;
}

function collectBlankLineDecorations(state: EditorState): PendingDecoration[] {
  const out: PendingDecoration[] = [];
  const hasCaret = (n: number) => {
    const line = state.doc.line(n);
    return state.selection.ranges.some((r) => r.empty && r.head >= line.from && r.head <= line.to);
  };

  for (const run of cachedBlankLineRuns(state)) {
    for (let j = run.from; j <= run.to; j++) {
      if (hasCaret(j)) continue;
      const line = state.doc.line(j);

      // The gap goes on the first blank line after text, or the first after
      // the caret's own empty paragraph; the rest of the run adds nothing.
      const startsGap = j === run.from || hasCaret(j - 1);

      const gap = startsGap ? (run.leadsIntoParagraph ? " cm-mkGapTight" : " cm-mkGapLoose") : "";
      out.push({
        from: line.from,
        to: line.from,
        isLine: true,
        deco: Decoration.line({ class: "cm-mkBlank" + gap }),
      });
    }
  }

  return out;
}

/**
 * Last set of blank-line runs, keyed on the exact doc and tree it came from.
 *
 * buildDecorations re-runs on every transaction, selection-only ones
 * included — so arrow keys and clicks rebuilt this even though the runs
 * depend on neither. Both identities are unchanged by a selection move, so
 * those transactions reuse the previous runs outright and only redo the
 * cheap caret-dependent pass above (which blank line the caret is on
 * decides which lines stay full-height and where the gap sits, so that part
 * must not be cached).
 */
let blankLineCache: { doc: EditorState["doc"]; tree: unknown; runs: BlankLineRun[] } | null = null;

function cachedBlankLineRuns(state: EditorState): BlankLineRun[] {
  const tree = syntaxTree(state);
  if (blankLineCache && blankLineCache.doc === state.doc && blankLineCache.tree === tree) {
    return blankLineCache.runs;
  }
  const runs = collectBlankLineRuns(state);
  blankLineCache = { doc: state.doc, tree, runs };
  return runs;
}

function buildDecorations(state: EditorState): DecorationSet {
  const pending: PendingDecoration[] = [];
  // Ranges smart typography (applied in a separate pass below) must never
  // touch: code, frontmatter, and link targets aren't prose.
  const smartTextExcluded: { from: number; to: number }[] = [];

  const hideMark = (node: { from: number; to: number }) => {
    pending.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      const type = node.type.name;

      if (type === "Frontmatter") {
        smartTextExcluded.push({ from: node.from, to: node.to });
        if (!isLineRangeActive(state, node.from, node.to)) {
          const source = state.doc.sliceString(node.from, node.to);
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new FrontmatterWidget(source), block: true }),
          });
          return false;
        }
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkFrontmatter" }) });
        return;
      }

      if (type === "FencedCode") {
        smartTextExcluded.push({ from: node.from, to: node.to });
        if (!isLineRangeActive(state, node.from, node.to)) {
          const syntaxNode = node.node;
          const infoNode = syntaxNode.getChild("CodeInfo");
          const lang = infoNode ? state.doc.sliceString(infoNode.from, infoNode.to).trim() : "";
          const codeNodes = syntaxNode.getChildren("CodeText");
          const code = codeNodes.map((n) => state.doc.sliceString(n.from, n.to)).join("\n");

          const widget = lang.toLowerCase() === "mermaid" ? new MermaidWidget(code) : new CodeBlockWidget(code, lang);

          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget, block: true }),
          });
          return false;
        }
        return;
      }

      if (type === "CodeText" || type === "CodeInfo" || type === "CodeMark") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkCodeText" }) });
        return;
      }

      if (type === "Table") {
        // Unlike every other construct here, this widget is never gated by
        // isLineRangeActive: it has its own click-to-edit cells (see
        // tableWidget.ts) rather than falling back to raw source text when
        // the selection is nearby. Entering a cell's edit mode moves the
        // browser's real DOM selection into the widget, which CM6 syncs
        // back as a state.selection change — if the widget were gated the
        // same way headings/bold are, that selection move would itself
        // trigger a rebuild that tears the widget (and the cell being
        // edited) down into raw text. Keeping the widget unconditional
        // means eq() (same source => same widget) keeps that DOM node,
        // and the cell's focus/caret, untouched across such rebuilds.
        smartTextExcluded.push({ from: node.from, to: node.to });
        const source = state.doc.sliceString(node.from, node.to);
        pending.push({
          from: node.from,
          to: node.to,
          deco: Decoration.replace({ widget: new TableWidget(source, node.from, node.to), block: true }),
        });
        return false;
      }

      if (type in HEADING_CLASS) {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: HEADING_CLASS[type] }) });
        // Zero-length, at the line's start: CM6 requires a line decoration
        // to sit exactly there. isLine marks it for the sort below, which
        // has to emit it ahead of any mark/replace starting at the same
        // offset (the hidden "## " does).
        const lineStart = state.doc.lineAt(node.from).from;
        pending.push({
          from: lineStart,
          to: lineStart,
          isLine: true,
          deco: Decoration.line({ class: HEADING_LINE_CLASS[type] }),
        });
        return;
      }

      if (type === "HeaderMark") {
        let end = node.to;
        if (state.doc.sliceString(end, end + 1) === " ") end += 1;
        pending.push({ from: node.from, to: end, deco: Decoration.replace({}) });
        return;
      }

      if (type === "EmphasisMark" || type === "CodeMark" || type === "StrikethroughMark") {
        hideMark(node);
        return;
      }

      if (type === "Emphasis") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkEm" }) });
        return;
      }
      if (type === "StrongEmphasis") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkStrong" }) });
        return;
      }
      if (type === "Strikethrough") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkStrike" }) });
        return;
      }
      if (type === "InlineCode") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkInlineCode" }) });
        smartTextExcluded.push({ from: node.from, to: node.to });
        return;
      }

      if (type === "Blockquote") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkQuote" }) });
        return;
      }
      if (type === "QuoteMark") {
        // Always visible: it's the only visual cue a line is quoted, unlike
        // bold/italic markers which have an alternative styled rendering.
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkQuoteMark" }) });
        return;
      }

      if (type === "ListMark") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkListMark" }) });
        return;
      }
      if (type === "TaskMarker") {
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkTask" }) });
        return;
      }

      if (type === "LinkMark" || type === "URL") {
        if (type === "URL") smartTextExcluded.push({ from: node.from, to: node.to });
        hideMark(node);
        return;
      }
      if (type === "Link") {
        const urlNode = node.node.getChild("URL");
        const href = urlNode ? state.doc.sliceString(urlNode.from, urlNode.to) : undefined;
        pending.push({
          from: node.from,
          to: node.to,
          deco: Decoration.mark({
            class: "cm-mkLink",
            attributes: href ? { "data-href": href, title: "⌘-click to open" } : undefined,
          }),
        });
        return;
      }

      if (type === "HardBreak") {
        // Shift-Enter writes "\\\n"; the backslash is syntax, not text.
        if (state.doc.sliceString(node.from, node.from + 1) === "\\") {
          pending.push({ from: node.from, to: node.from + 1, deco: Decoration.replace({}) });
        }
        return;
      }

      if (type === "HorizontalRule") {
        // Unlike fenced code/tables, there's no raw source worth exposing here
        // (it's always exactly "---"/"***"/"___") — so unlike those, this isn't
        // gated on isLineRangeActive. The widget's margin makes it much taller
        // than a plain text line, so swapping it in/out as the cursor crosses
        // the line would jump the layout underneath the selection.
        pending.push({
          from: node.from,
          to: node.to,
          deco: Decoration.replace({ widget: new HrWidget(), block: false }),
        });
        return;
      }
    },
  });

  // Defensive: also exclude every range the main pass already replaced
  // (hidden markdown marks, widgets), so a smart-typography match can
  // never overlap them — CM6 throws on overlapping replace decorations.
  for (const p of pending) {
    if (p.from !== p.to) smartTextExcluded.push({ from: p.from, to: p.to });
  }
  const pathLinks = collectPathLinkDecorations(state, smartTextExcluded);
  smartTextExcluded.push(...pathLinks.map((p) => ({ from: p.from, to: p.to })));
  pending.push(...pathLinks);
  pending.push(...collectSmartTypographyDecorations(state, smartTextExcluded));
  pending.push(...collectBlankLineDecorations(state));

  pending.sort(
    (a, b) => a.from - b.from || Number(b.isLine ?? false) - Number(a.isLine ?? false) || a.to - b.to,
  );

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of pending) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

function selectionChanged(tr: Transaction): boolean {
  return !tr.startState.selection.eq(tr.state.selection);
}

export const livePreviewField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    // Lezer parses large documents incrementally across idle-callback
    // chunks rather than all at once on mount — @codemirror/language
    // dispatches an empty transaction each time background parsing makes
    // further progress (see its parseWorker), specifically so consumers
    // like this get a chance to rebuild. Without this check, headings/bold
    // past whatever synchronously parsed on load stay as raw "##"/"**"
    // until an unrelated doc or selection change happens to trigger one.
    if (tr.docChanged || selectionChanged(tr) || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return buildDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

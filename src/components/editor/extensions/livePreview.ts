import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { CodeBlockWidget } from "./codeBlockWidget";
import { MermaidWidget } from "./mermaidWidget";
import { TableWidget } from "./tableWidget";
import { collectSmartTypographyDecorations } from "./smartTypographyIntegration";
import { collectPathLinkDecorations } from "./pathLink";

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


/** The top-level block a position sits in, or "Document" when it sits
 *  between blocks — which is exactly where a separating blank line is. */
function topLevelBlockAt(state: EditorState, pos: number): string {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node.parent && node.parent.name !== "Document") node = node.parent;
  return node.name;
}

/**
 * Spacing for the blank lines BETWEEN blocks.
 *
 * The document stays plain markdown, so the gap between two paragraphs is
 * a real empty line, and every empty line is the same height as a line of
 * prose — far more air than paragraph spacing wants. These shrink it, and
 * shrink it by different amounts depending on what comes next: a run of
 * paragraphs reads as one block of thought and wants to be tight, while
 * the last paragraph before something else (a heading, a list, the end of
 * the document) wants a little more room to close the group off.
 *
 * Only blank lines that actually separate top-level blocks are touched —
 * a blank line inside fenced code, frontmatter, a table or a quote
 * resolves to that block rather than to "Document", and is left alone.
 */
function collectBlankLineDecorations(state: EditorState): PendingDecoration[] {
  const out: PendingDecoration[] = [];
  const lineCount = state.doc.lines;

  for (let i = 1; i <= lineCount; i++) {
    const line = state.doc.line(i);
    if (line.text.trim().length !== 0) continue;
    if (topLevelBlockAt(state, line.from) !== "Document") continue;

    // Skip any further blank lines to find the block this gap leads into.
    let next = i + 1;
    while (next <= lineCount && state.doc.line(next).text.trim().length === 0) next++;
    const leadsIntoParagraph =
      next <= lineCount && topLevelBlockAt(state, state.doc.line(next).from) === "Paragraph";

    out.push({
      from: line.from,
      to: line.from,
      isLine: true,
      deco: Decoration.line({ class: leadsIntoParagraph ? "cm-mkBlankTight" : "cm-mkBlankLoose" }),
    });
  }

  return out;
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
        pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-mkFrontmatter" }) });
        smartTextExcluded.push({ from: node.from, to: node.to });
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

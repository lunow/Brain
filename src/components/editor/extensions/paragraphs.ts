import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type Command, type KeyBinding } from "@codemirror/view";
import { insertNewlineAndIndent } from "@codemirror/commands";

/**
 * Real paragraphs on top of plain markdown.
 *
 * The file keeps the standard `paragraph\n\nparagraph` shape, but the editor
 * never presents the separating blank line as a line: livePreview.ts
 * collapses it into a bit of vertical space, and the pieces here keep the
 * caret and the keyboard from ever treating it as something to land on.
 *
 *   Enter        new paragraph  (inserts the "\n\n")
 *   Shift-Enter  new line inside the paragraph (a markdown hard break, "\\\n")
 *   Backspace    at a paragraph's start, joins it onto the previous one
 *   Delete       at a paragraph's end, pulls the next one up
 */

/** The top-level block a position sits in, or "Document" when it sits
 *  between blocks — which is exactly where a separating blank line is. */
export function topLevelBlockAt(state: EditorState, pos: number): string {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node.parent && node.parent.name !== "Document") node = node.parent;
  return node.name;
}

function isBlankText(text: string): boolean {
  return text.trim().length === 0;
}

/** An empty line that sits between top-level blocks (as opposed to inside
 *  fenced code, a table, a quote, …, where it is real content). */
export function isSeparatorBlank(state: EditorState, lineNumber: number): boolean {
  const line = state.doc.line(lineNumber);
  return isBlankText(line.text) && topLevelBlockAt(state, line.from) === "Document";
}

/** Block type of a non-empty line, probed at its first visible character. */
function blockOfLine(state: EditorState, lineNumber: number): string {
  const line = state.doc.line(lineNumber);
  const indent = line.text.length - line.text.trimStart().length;
  return topLevelBlockAt(state, line.from + indent);
}

const isHeading = (block: string) => block.startsWith("ATXHeading");
const isProse = (block: string) => block === "Paragraph" || isHeading(block);

/** Enter: start a new paragraph rather than a new source line. Anything that
 *  isn't plain prose (lists, quotes, code, tables, frontmatter) keeps the
 *  default newline behavior. */
const newParagraph: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (isBlankText(line.text)) {
      if (topLevelBlockAt(state, line.from) !== "Document") return false;
    } else if (!isProse(blockOfLine(state, line.number))) {
      return false;
    }
  }

  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.head);
      if (isBlankText(line.text)) {
        // Already on an empty line. Directly under text it completes the
        // separator; anywhere else another Enter would only stack up
        // invisible blank lines, so it does nothing.
        const underText = line.number > 1 && !isBlankText(state.doc.line(line.number - 1).text);
        if (!underText) return { range };
        return {
          changes: { from: line.from, insert: "\n" },
          range: EditorSelection.cursor(line.from + 1),
        };
      }
      return {
        changes: { from: range.from, to: range.to, insert: "\n\n" },
        range: EditorSelection.cursor(range.from + 2),
      };
    }),
    { scrollIntoView: true, userEvent: "input" },
  );
  return true;
};

/** Shift-Enter: a line break that stays inside the paragraph. A bare "\n"
 *  would be folded into a space by every markdown renderer, so this writes a
 *  backslash hard break (livePreview.ts hides the backslash). */
const softLineBreak: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const inParagraph = state.selection.ranges.every((range) => {
    const line = state.doc.lineAt(range.head);
    return !isBlankText(line.text) && blockOfLine(state, line.number) === "Paragraph";
  });
  if (!inParagraph) return insertNewlineAndIndent(view);

  view.dispatch(
    state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: "\\\n" },
      range: EditorSelection.cursor(range.from + 2),
    })),
    { scrollIntoView: true, userEvent: "input" },
  );
  return true;
};

/** Backspace at the very start of a paragraph removes the whole separator,
 *  not just one of its two newlines (which would strand the caret on the
 *  collapsed blank line). Also what undoes an Enter that made an empty
 *  paragraph. */
const joinWithPrevious: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  if (state.readOnly || state.selection.ranges.length !== 1 || !sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.from || line.number < 3) return false;
  if (!isSeparatorBlank(state, line.number - 1)) return false;
  const before = state.doc.line(line.number - 2);
  if (isBlankText(before.text)) return false;

  const joinable = isBlankText(line.text)
    ? isProse(blockOfLine(state, before.number))
    : blockOfLine(state, line.number) === "Paragraph" && blockOfLine(state, before.number) === "Paragraph";
  if (!joinable) return false;

  view.dispatch({
    changes: { from: before.to, to: line.from },
    selection: EditorSelection.cursor(before.to),
    scrollIntoView: true,
    userEvent: "delete.backward",
  });
  return true;
};

/** Delete at the end of a paragraph: the mirror of joinWithPrevious. */
const joinWithNext: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  if (state.readOnly || state.selection.ranges.length !== 1 || !sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to || line.number + 2 > state.doc.lines || isBlankText(line.text)) return false;
  if (!isSeparatorBlank(state, line.number + 1)) return false;
  const after = state.doc.line(line.number + 2);
  if (isBlankText(after.text)) return false;
  if (blockOfLine(state, line.number) !== "Paragraph" || blockOfLine(state, after.number) !== "Paragraph") return false;

  view.dispatch({
    changes: { from: line.to, to: after.from },
    scrollIntoView: true,
    userEvent: "delete.forward",
  });
  return true;
};

export const paragraphKeyBindings: KeyBinding[] = [
  { key: "Enter", run: newParagraph },
  { key: "Shift-Enter", run: softLineBreak },
  { key: "Backspace", run: joinWithPrevious },
  { key: "Delete", run: joinWithNext },
];

/**
 * Where a navigation-only selection change should put a caret that landed on
 * a collapsed separator line: the next paragraph when moving forward, the
 * end of the previous one when moving back. Null when `head` isn't on one.
 * Exported for tests.
 */
export function skipSeparator(state: EditorState, head: number, previousHead: number): number | null {
  const line = state.doc.lineAt(head);
  if (!isSeparatorBlank(state, line.number)) return null;

  const forward = head > previousHead;
  const scan = (step: 1 | -1): number | null => {
    for (let n = line.number + step; n >= 1 && n <= state.doc.lines; n += step) {
      const candidate = state.doc.line(n);
      if (!isBlankText(candidate.text)) return step === 1 ? candidate.from : candidate.to;
    }
    return null;
  };
  return (forward ? scan(1) ?? scan(-1) : scan(-1) ?? scan(1));
}

/** Arrow keys and clicks step over the collapsed separator instead of
 *  parking an invisible caret on it. Only pure navigation is filtered: a
 *  typed Enter legitimately leaves the caret on a fresh, visible empty line. */
const keepCaretOffSeparators = EditorState.transactionFilter.of((tr) => {
  if (tr.docChanged || !tr.selection) return tr;
  const previousHead = tr.startState.selection.main.head;
  let changed = false;
  const ranges = tr.selection.ranges.map((range) => {
    if (!range.empty) return range;
    const target = skipSeparator(tr.state, range.head, previousHead);
    if (target === null) return range;
    changed = true;
    return EditorSelection.cursor(target);
  });
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }];
});

export const paragraphs: Extension = keepCaretOffSeparators;

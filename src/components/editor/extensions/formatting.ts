import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import { type Command, type KeyBinding } from "@codemirror/view";

/**
 * Cmd-B / Cmd-I toggle bold/italic markdown around the selection (or the
 * word under a collapsed cursor). Because livePreview.ts always hides
 * `**`/`*` delimiters, these are the primary way to apply/remove that
 * formatting — the user never has to see or hand-type the marks.
 */
function makeToggleWrap(mark: string, nodeType: string): Command {
  return (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
      let wrapper: { from: number; to: number } | null = null;
      let node = syntaxTree(state).resolveInner(range.from, 1);
      for (; node.parent; node = node.parent) {
        if (node.type.name === nodeType && node.from <= range.from && node.to >= range.to) {
          wrapper = { from: node.from, to: node.to };
          break;
        }
      }

      if (wrapper) {
        const markLen = mark.length;
        const changes: ChangeSpec[] = [
          { from: wrapper.from, to: wrapper.from + markLen, insert: "" },
          { from: wrapper.to - markLen, to: wrapper.to, insert: "" },
        ];
        const from = Math.max(wrapper.from, range.from - markLen);
        const to = Math.max(wrapper.from, range.to - markLen);
        return { changes, range: EditorSelection.range(from, to) };
      }

      if (range.empty) {
        const word = state.wordAt(range.from);
        if (word) {
          return {
            changes: [
              { from: word.from, insert: mark },
              { from: word.to, insert: mark },
            ],
            range: EditorSelection.range(word.from + mark.length, word.to + mark.length),
          };
        }
        return {
          changes: { from: range.from, insert: mark + mark },
          range: EditorSelection.cursor(range.from + mark.length),
        };
      }

      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(range.from + mark.length, range.to + mark.length),
      };
    });
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

const toggleBold = makeToggleWrap("**", "StrongEmphasis");
const toggleItalic = makeToggleWrap("*", "Emphasis");

/** Merged into MarkdownEditor's own keymap.of(...) call so precedence
 *  against defaultKeymap is unambiguous (facet precedence between separate
 *  keymap.of extensions depends on extension ordering, which is easy to
 *  get wrong; a shared array sidesteps that). */
export const formattingKeyBindings: KeyBinding[] = [
  { key: "Mod-b", run: toggleBold, preventDefault: true },
  { key: "Mod-i", run: toggleItalic, preventDefault: true },
];

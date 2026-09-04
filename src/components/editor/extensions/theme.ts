import { EditorView } from "@codemirror/view";

export const editorTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--font-serif)",
    fontSize: "var(--type-editor-body)",
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    maxWidth: "100%",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    padding: "0",
    lineHeight: "var(--leading-body)",
    caretColor: "var(--text-primary)",
    maxWidth: "100%",
  },
  ".cm-cursor": {
    borderLeftWidth: "2px",
  },
  "@media (prefers-reduced-motion: reduce)": {
    ".cm-cursor": {
      animation: "none !important",
    },
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    overflow: "visible",
    maxWidth: "100%",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--bg-active) !important",
  },
});

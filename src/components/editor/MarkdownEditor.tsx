import { useEffect, useRef, type RefObject } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { livePreviewField } from "./extensions/livePreview";
import { formattingKeyBindings } from "./extensions/formatting";
import { pathLinkClickHandler } from "./extensions/pathLink";
import { mdLinkClickHandler } from "./extensions/mdLink";
import { pasteLinkHandler } from "./extensions/pasteLink";
import { frontmatterExtension } from "./extensions/frontmatter";
import { editorTheme } from "./extensions/theme";
import { reviewSuggestionsExtension, setSuggestionsEffect, type SuggestionAction } from "./extensions/reviewSuggestions";
import { scrollCursorToFraction } from "./extensions/typewriterScroll";
import type { PlacedSuggestion } from "@/lib/reviewSuggestions";
import "./editor.css";
import styles from "./MarkdownEditor.module.css";

interface MarkdownEditorProps {
  content: string;
  filePath: string;
  onChange: (content: string) => void;
  /** Review-mode suggestions for this file, rendered as inline decorations
   *  via reviewSuggestionsExtension. Empty outside Review mode. */
  suggestions?: PlacedSuggestion[];
  onResolveSuggestion?: (id: string, action: SuggestionAction) => void;
  /** Exposes the mounted view so a sibling (the Review sidebar) can trigger
   *  the same accept/reject transaction as the inline buttons — see
   *  useReviewStore.activeView. */
  onViewReady?: (view: EditorView | null) => void;
  /** The actual scrollable ancestor (FileEditor's `.scrollArea`), used for
   *  the typewriter-scroll effect. Read fresh on every relevant update
   *  rather than captured once, so it doesn't need to be a dependency. */
  scrollParentRef?: RefObject<HTMLElement | null>;
}

/**
 * One CodeMirror EditorView per mounted instance. The parent keys this
 * component by file path so switching files remounts a fresh editor rather
 * than trying to hot-swap the document into a live EditorState.
 */
export function MarkdownEditor({
  content,
  filePath,
  onChange,
  suggestions = [],
  onResolveSuggestion,
  onViewReady,
  scrollParentRef,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onResolveSuggestionRef = useRef(onResolveSuggestion);
  onResolveSuggestionRef.current = onResolveSuggestion;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([...formattingKeyBindings, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, extensions: [GFM, frontmatterExtension] }),
        EditorView.lineWrapping,
        livePreviewField,
        pathLinkClickHandler,
        mdLinkClickHandler(() => filePath),
        pasteLinkHandler,
        editorTheme,
        reviewSuggestionsExtension((id, action) => onResolveSuggestionRef.current?.(id, action)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          // Mouse drag-to-select fires a selectionSet on every pointer-move tick
          // (CodeMirror tags these "select.pointer"), and CodeMirror already
          // auto-scrolls the parent as a drag nears the viewport edge. Re-pinning
          // the head to the typewriter fraction on top of that fights the drag's
          // own scroll and can spiral the view to the top.
          const isPointerSelection = update.transactions.some((tr) => tr.isUserEvent("select.pointer"));
          // More generally, any non-empty ("marked") selection conflicts with
          // the pin the same way — including keyboard selection (Shift+Arrow):
          // recentering the head mid-selection fights the very selection the
          // user is building. Typewriter scroll is only meaningful for a bare
          // cursor moving through text, so skip it whenever a range is selected.
          const hasActiveSelection = !update.state.selection.main.empty;
          // Table cell edits (tableWidget.ts) commit via a docChanged dispatch
          // tagged "input.table" — CM's own selection is stale there (cell
          // editing happens in a contentEditable DOM node outside CM's
          // selection model), so pinning to it would jump the scroll position
          // to that unrelated spot instead of leaving the table in view.
          const isTableEdit = update.transactions.some((tr) => tr.isUserEvent("input.table"));
          if (
            (update.selectionSet && !isPointerSelection && !hasActiveSelection) ||
            (update.docChanged && !isTableEdit)
          ) {
            scrollCursorToFraction(update.view, scrollParentRef?.current ?? null);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    onViewReady?.(view);

    return () => {
      viewRef.current = null;
      onViewReady?.(null);
      view.destroy();
    };
    // Mount once per instance; remounting on file switch is handled by the
    // parent via a `key` prop rather than syncing `content` into this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSuggestionsEffect.of(suggestions) });
  }, [suggestions]);

  return <div className={styles.host} ref={hostRef} />;
}

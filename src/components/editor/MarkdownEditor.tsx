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
import { typewriterScroll } from "./extensions/typewriterScroll";
import { externalReloadAnnotation, minimalReplacement } from "./externalSync";
import type { PlacedSuggestion } from "@/lib/reviewSuggestions";
import "./editor.css";
import styles from "./MarkdownEditor.module.css";

interface MarkdownEditorProps {
  content: string;
  filePath: string;
  onChange: (content: string) => void;
  /** Fresh on-disk content to fold into the live document, bumped by the
   *  parent whenever it decides an external change should be adopted. The
   *  token (not the text) drives the sync, so re-reading the file and getting
   *  the same bytes back is still a no-op. */
  externalReload?: { text: string; token: number } | null;
  /** Review-mode suggestions for this file, rendered as inline decorations
   *  via reviewSuggestionsExtension. Empty outside Review mode. */
  suggestions?: PlacedSuggestion[];
  onResolveSuggestion?: (id: string, action: SuggestionAction) => void;
  /** Exposes the mounted view so a sibling (the Review sidebar) can trigger
   *  the same accept/reject transaction as the inline buttons — see
   *  useReviewStore.activeView. */
  onViewReady?: (view: EditorView | null) => void;
  /** The actual scrollable ancestor (FileEditor's `.scrollArea`), used for
   *  the typewriter-scroll extension. Read fresh on every relevant update
   *  rather than captured once, so it doesn't need to be a dependency. */
  scrollParentRef?: RefObject<HTMLElement | null>;
}

/**
 * One CodeMirror EditorView per mounted instance. The parent keys this
 * component by file path so switching files remounts a fresh editor rather
 * than trying to hot-swap the document into a live EditorState. A file
 * changing *underneath* an open editor is not a remount: it's patched into
 * the live document via `externalReload` so the view keeps its scroll
 * position, selection and undo history.
 */
export function MarkdownEditor({
  content,
  filePath,
  onChange,
  externalReload,
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
          if (!update.docChanged) return;
          // A reload from disk is not a user edit: reporting it would mark the
          // file dirty and schedule an autosave of what we just read back.
          if (update.transactions.some((tr) => tr.annotation(externalReloadAnnotation))) return;
          onChangeRef.current(update.state.doc.toString());
        }),
        typewriterScroll(() => scrollParentRef?.current ?? null),
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

  // Adopt a change made to the file on disk by patching only the bytes that
  // actually differ, so the editor stays exactly where the user left it.
  const appliedReloadToken = useRef(externalReload?.token ?? 0);
  useEffect(() => {
    if (!externalReload || externalReload.token === appliedReloadToken.current) return;
    appliedReloadToken.current = externalReload.token;
    const view = viewRef.current;
    if (!view) return;
    const replacement = minimalReplacement(view.state.doc.toString(), externalReload.text);
    if (!replacement) return;
    view.dispatch({
      changes: replacement,
      annotations: externalReloadAnnotation.of(true),
      scrollIntoView: false,
    });
  }, [externalReload]);

  return <div className={styles.host} ref={hostRef} />;
}

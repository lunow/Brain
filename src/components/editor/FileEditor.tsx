import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { readFile, writeFile } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX } from "@/stores/ui";
import { useReviewStore, EMPTY_SUGGESTIONS } from "@/stores/review";
import { loadSavedReview } from "@/lib/reviewPersistence";
import { locateSuggestions } from "@/lib/reviewSuggestions";
import { useExport } from "@/hooks/useExport";
import { ModeToggle } from "@/components/mode/ModeToggle";
import { IdeateSidebar } from "@/components/sidebar/IdeateSidebar";
import { ReviewSidebar } from "@/components/sidebar/ReviewSidebar";
import { ColumnResizer } from "@/components/layout/ColumnResizer";
import { PanelVisibilityToggles } from "@/components/layout/PanelVisibilityToggles";
import { MarkdownEditor } from "./MarkdownEditor";
import { WidthToolbar } from "./WidthToolbar";
import type { ExportKind } from "./ExportMenu";
import styles from "./FileEditor.module.css";
import type { FsChangedPayload } from "@/hooks/useFsWatcher";

const AUTOSAVE_DELAY_MS = 1500;

export function FileEditor() {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const widthPreset = useUiStore((s) => s.widthPreset);
  const writingMode = useUiStore((s) => s.writingMode);
  const queryClient = useQueryClient();
  const { requestExport } = useExport();

  const rightPanel: ReactNode =
    writingMode === "ideate" ? <IdeateSidebar /> : writingMode === "review" ? <ReviewSidebar /> : null;

  const rightSidebarWidth = useUiStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useUiStore((s) => s.setRightSidebarWidth);
  const rightSidebarVisible = useUiStore((s) => s.rightSidebarVisible);
  const fullscreenActive = useUiStore((s) => s.fullscreenActive);

  const leading = <PanelVisibilityToggles />;
  const center = <ModeToggle />;

  const sidebarSection = rightPanel && rightSidebarVisible && !fullscreenActive && (
    <>
      <ColumnResizer
        width={rightSidebarWidth}
        onChange={setRightSidebarWidth}
        min={RIGHT_SIDEBAR_WIDTH_MIN}
        max={RIGHT_SIDEBAR_WIDTH_MAX}
        invert
      />
      <div className={styles.sidebarPane} style={{ width: rightSidebarWidth }}>
        {rightPanel}
      </div>
    </>
  );

  const suggestions = useReviewStore((s) =>
    selectedFilePath ? (s.suggestionsByFile[selectedFilePath] ?? EMPTY_SUGGESTIONS) : EMPTY_SUGGESTIONS,
  );
  // Only render suggestion decorations while actually in Review mode — they
  // stay in the store (and on disk) so switching back to Review shows them
  // again instantly, but Write/Ideate should read as a clean document.
  const visibleSuggestions = writingMode === "review" ? suggestions : EMPTY_SUGGESTIONS;
  const resolveSuggestion = useReviewStore((s) => s.resolveSuggestion);
  const setActiveEditorView = useUiStore((s) => s.setActiveEditorView);

  const { data: initialContent, isLoading } = useQuery({
    queryKey: ["fileContent", selectedFilePath],
    queryFn: () => readFile(selectedFilePath as string),
    enabled: !!selectedFilePath,
  });

  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Content of the last write this app made to selectedFilePath. The fs
  // watcher reports our own autosave writes as filesystem events (with a
  // ~400ms debounce delay), so relying on the `dirty` flag alone to decide
  // "is this an external change" races against the user resuming typing in
  // that window. Comparing against exactly what we wrote lets us recognize
  // and ignore that echo regardless of dirty/timing.
  const lastWrittenContent = useRef<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (path: string) => {
      if (pendingContent.current === null) return undefined;
      const content = pendingContent.current;
      await writeFile(path, content);
      return content;
    },
    onSuccess: (writtenContent) => {
      if (writtenContent === undefined) return;
      lastWrittenContent.current = writtenContent;
      // Only clear dirty if no newer edit arrived while this write was in
      // flight — otherwise we'd clobber the dirty flag for unsaved content
      // a later autosave timer is already scheduled to pick up.
      if (pendingContent.current === writtenContent) {
        setDirty(false);
      }
      queryClient.invalidateQueries({ queryKey: ["markdownFiles"] });
    },
  });

  function handleChange(newContent: string) {
    if (!selectedFilePath) return;
    pendingContent.current = newContent;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate(selectedFilePath), AUTOSAVE_DELAY_MS);
  }

  // Flush a pending save when switching away from a dirty file, and reset
  // dirty/pending/conflict state for the newly selected one.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [selectedFilePath]);

  useEffect(() => {
    setDirty(false);
    setConflict(false);
    pendingContent.current = null;
    lastWrittenContent.current = null;
  }, [selectedFilePath]);

  // Read back a saved review sidecar the first time a file is opened this
  // session, so past suggestions survive an app restart. Skipped if the
  // store already has suggestions for this path (an active run, or an
  // earlier load already completed). Positions are relocated against
  // initialContent — the exact text the editor is about to mount with —
  // rather than the live CM doc, which may not exist yet.
  const attemptedLoads = useRef(new Set<string>());
  useEffect(() => {
    if (!selectedFilePath || initialContent === undefined) return;
    if (attemptedLoads.current.has(selectedFilePath)) return;
    attemptedLoads.current.add(selectedFilePath);
    if (useReviewStore.getState().suggestionsByFile[selectedFilePath] !== undefined) return;

    loadSavedReview(selectedFilePath).then((saved) => {
      if (!saved) return;
      if (useReviewStore.getState().suggestionsByFile[selectedFilePath] !== undefined) return;
      const { placed } = locateSuggestions(initialContent, saved.suggestions);
      useReviewStore.getState().loadSuggestions(selectedFilePath, placed, {
        agentId: saved.agentId,
        agentLabel: saved.agentLabel,
        customInstructions: saved.customInstructions,
        reviewedAt: saved.reviewedAt,
      });
    });
  }, [selectedFilePath, initialContent]);

  // External-change detection for the currently open file. If it has no
  // unsaved edits, silently reload; if it does, surface a conflict banner
  // rather than clobbering local changes. We always read the fresh content
  // first and compare it against lastWrittenContent — the exact bytes of
  // our own last autosave — so an echo of our own write is recognized and
  // ignored outright, even if the user resumed typing (and dirty flipped
  // back to true) in the ~400ms the fs watcher takes to report it.
  useEffect(() => {
    if (!selectedFilePath) return;
    let disposed = false;

    const unlistenPromise = listen<FsChangedPayload>("fs://changed", (event) => {
      if (disposed) return;
      if (!event.payload.paths.includes(selectedFilePath)) return;

      queryClient.invalidateQueries({ queryKey: ["fileContent", selectedFilePath] }).then(() => {
        if (disposed) return;
        const freshContent = queryClient.getQueryData<string>(["fileContent", selectedFilePath]);
        if (freshContent === lastWrittenContent.current) return;

        if (dirtyRef.current) {
          setConflict(true);
          return;
        }

        const knownContent = pendingContent.current ?? initialContent;
        if (freshContent === knownContent) return;
        setReloadNonce((n) => n + 1);
      });
    });

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
    // initialContent intentionally omitted: it changes every reload and
    // would otherwise force this listener to resubscribe each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilePath, queryClient]);

  function handleExport(kind: ExportKind) {
    requestExport(kind, selectedFilePath);
  }

  async function discardAndReload() {
    if (!selectedFilePath) return;
    setConflict(false);
    setDirty(false);
    pendingContent.current = null;
    await queryClient.invalidateQueries({ queryKey: ["fileContent", selectedFilePath] });
    setReloadNonce((n) => n + 1);
  }

  if (!selectedFilePath) {
    return (
      <div className={styles.wrapper}>
        {!fullscreenActive && (
          <WidthToolbar dirty={false} onExport={handleExport} disabled leading={leading} center={center} />
        )}
        <div className={styles.body}>
          <div className={styles.editorPane}>
            <div className={styles.emptyState}>
              <p>Select a file to start writing.</p>
            </div>
          </div>
          {sidebarSection}
        </div>
      </div>
    );
  }

  if (isLoading || initialContent === undefined) {
    return (
      <div className={styles.wrapper}>
        {!fullscreenActive && (
          <WidthToolbar dirty={false} onExport={handleExport} disabled leading={leading} center={center} />
        )}
        <div className={styles.body}>
          <div className={styles.editorPane}>
            <div className={styles.loading}>Loading…</div>
          </div>
          {sidebarSection}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {!fullscreenActive && <WidthToolbar dirty={dirty} onExport={handleExport} leading={leading} center={center} />}
      <div className={styles.body}>
        <div className={styles.editorPane}>
          {conflict && (
            <div className={styles.conflictBanner}>
              <span>This file changed on disk.</span>
              <button type="button" onClick={discardAndReload} title="Discard your local changes and reload from disk">
                Reload
              </button>
              <button
                type="button"
                onClick={() => setConflict(false)}
                title="Dismiss this notice and keep your local changes"
              >
                Keep mine
              </button>
            </div>
          )}
          <div className={styles.scrollArea} ref={scrollAreaRef}>
            <div
              className={`${styles.widthContainer} prose`}
              data-width={widthPreset}
              data-centered={fullscreenActive && widthPreset !== "full"}
            >
              <MarkdownEditor
                key={`${selectedFilePath}:${reloadNonce}`}
                content={initialContent}
                filePath={selectedFilePath}
                onChange={handleChange}
                suggestions={visibleSuggestions}
                onResolveSuggestion={(id) => selectedFilePath && resolveSuggestion(selectedFilePath, id)}
                onViewReady={setActiveEditorView}
                scrollParentRef={scrollAreaRef}
              />
            </div>
          </div>
        </div>
        {sidebarSection}
      </div>
    </div>
  );
}

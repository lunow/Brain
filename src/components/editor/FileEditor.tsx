import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { readFile, writeFile } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore, hasRightSidebar, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX } from "@/stores/ui";
import { useReviewStore, EMPTY_SUGGESTIONS } from "@/stores/review";
import { loadSavedReview } from "@/lib/reviewPersistence";
import { locateSuggestions } from "@/lib/reviewSuggestions";
import { useExport } from "@/hooks/useExport";
import { ModeToggle } from "@/components/mode/ModeToggle";
import { IdeateSidebar } from "@/components/sidebar/IdeateSidebar";
import { ReviewSidebar } from "@/components/sidebar/ReviewSidebar";
import { GraphView } from "@/components/graph/GraphView";
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

  let rightPanel: ReactNode = null;
  if (hasRightSidebar(writingMode)) {
    rightPanel = writingMode === "ideate" ? <IdeateSidebar /> : <ReviewSidebar />;
  }

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
  // Fresh on-disk content handed to the live editor to patch in place. The
  // editor is deliberately NOT remounted for this: a remount builds a new
  // EditorView and so resets the scroll position to the top of the file.
  const [externalReload, setExternalReload] = useState<{ text: string; token: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Mirrors the latest loaded content for the fs listener below. That
  // listener deliberately doesn't re-subscribe when the content changes, so
  // reading `initialContent` from its closure froze it at whatever was
  // loaded when selectedFilePath last changed. After adopting an external
  // change, the frozen value was the file's ORIGINAL text — so if the file
  // was then reverted on disk (git checkout, undo in another editor), the
  // revert compared equal to that stale value and was discarded, leaving
  // the editor showing the superseded text and ready to save it back over
  // the revert. A ref is read at call time and cannot go stale.
  const initialContentRef = useRef(initialContent);
  initialContentRef.current = initialContent;
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
    setExternalReload(null);
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
  // unsaved edits, silently fold the new content into the live document (see
  // MarkdownEditor's externalReload) so the user keeps their scroll position,
  // cursor and undo history; if it does have unsaved edits, surface a conflict
  // banner rather than clobbering local changes. We always read the fresh
  // content first and compare it against lastWrittenContent — the exact bytes
  // of our own last autosave — so an echo of our own write is recognized and
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

        const knownContent = pendingContent.current ?? initialContentRef.current;
        if (freshContent === knownContent || freshContent === undefined) return;
        pendingContent.current = null;
        setExternalReload((prev) => ({ text: freshContent, token: (prev?.token ?? 0) + 1 }));
      });
    });

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
    // initialContent intentionally omitted: it changes every reload and
    // would otherwise force this listener to resubscribe each time. It is
    // read through initialContentRef instead, which stays current.
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
    const freshContent = queryClient.getQueryData<string>(["fileContent", selectedFilePath]);
    if (freshContent === undefined) return;
    setExternalReload((prev) => ({ text: freshContent, token: (prev?.token ?? 0) + 1 }));
  }

  // Explore mode takes over the pane, and unlike the others it works with no
  // file open at all — so it returns ahead of the "select a file" and
  // "loading" states below rather than through them. The toolbar stays so the
  // mode toggle is still reachable; its width and export controls are
  // meaningless here and go disabled.
  if (writingMode === "explore") {
    return (
      <div className={styles.wrapper}>
        {!fullscreenActive && (
          <WidthToolbar dirty={dirty} onExport={handleExport} disabled leading={leading} center={center} />
        )}
        <div className={styles.body}>
          <GraphView />
        </div>
      </div>
    );
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
              // Distinct from data-centered below, which is false both when
              // we're not in fullscreen AND in fullscreen on the Full
              // preset — the two want different vertical margins.
              data-fullscreen={fullscreenActive}
              data-centered={fullscreenActive && widthPreset !== "full"}
            >
              <MarkdownEditor
                key={selectedFilePath}
                content={initialContent}
                externalReload={externalReload}
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

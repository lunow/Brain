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
import { useTypewriterOverscroll } from "./useTypewriterOverscroll";
import { MarkdownEditor } from "./MarkdownEditor";
import { WidthToolbar } from "./WidthToolbar";
import type { ExportKind } from "./ExportMenu";
import styles from "./FileEditor.module.css";
import type { FsChangedPayload } from "@/hooks/useFsWatcher";

const AUTOSAVE_DELAY_MS = 1500;
const SETTLE_DELAY_MS = 150;
const SETTLE_MAX_READS = 6;

/**
 * Reads a file another program is writing, once it has stopped changing.
 * Most writers truncate the file and then fill it, and a watcher event can
 * land in between: adopting that read showed an empty or cut-off document,
 * which collapsed the scroll range and left the editor at the top of the
 * file once the full text arrived. Two identical reads a moment apart mean
 * the write is done. Returns null if the file can't be read (an atomic save
 * mid-rename, a deletion) — there's nothing to adopt then.
 */
async function readSettledFile(path: string): Promise<string | null> {
  let previous: string | null = null;
  for (let i = 0; i < SETTLE_MAX_READS; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    let current: string;
    try {
      current = await readFile(path);
    } catch {
      previous = null;
      continue;
    }
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

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
  const activeEditorView = useUiStore((s) => s.activeEditorView);
  const setActiveEditorView = useUiStore((s) => s.setActiveEditorView);

  const { data: initialContent, isLoading } = useQuery({
    queryKey: ["fileContent", selectedFilePath],
    queryFn: () => readFile(selectedFilePath as string),
    enabled: !!selectedFilePath,
  });

  const [dirty, setDirty] = useState(false);
  const [conflict, setConflictState] = useState(false);
  // Autosave holds off while the conflict banner is up: writing the local
  // text would silently overwrite the external change before the user has
  // picked "Reload" or "Keep mine", leaving Reload nothing to reload.
  const conflictRef = useRef(false);
  function setConflict(value: boolean) {
    conflictRef.current = value;
    setConflictState(value);
  }
  // Fresh on-disk content handed to the live editor to patch in place. The
  // editor is deliberately NOT remounted for this: a remount builds a new
  // EditorView and so resets the scroll position to the top of the file.
  const [externalReload, setExternalReload] = useState<{ text: string; token: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useTypewriterOverscroll(scrollAreaRef, fullscreenActive ? activeEditorView : null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // What we believe is on disk for selectedFilePath right now: the text the
  // file was loaded with, then whatever we last wrote or adopted. A disk read
  // is only an external change if it differs from THIS. The watcher reports
  // events that aren't changes at all — our own autosave echoing back ~400ms
  // later, or a file created moments ago still reporting its creation after
  // the user has started typing — and treating every event on a dirty file
  // as a conflict raised the "changed on disk" banner for files nobody else
  // had touched.
  const diskContent = useRef<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (path: string) => {
      if (pendingContent.current === null || conflictRef.current) return undefined;
      const content = pendingContent.current;
      // Recorded before the write, not after: a read racing the write (a
      // window-focus refetch) must already recognize these bytes as ours.
      diskContent.current = content;
      await writeFile(path, content);
      return content;
    },
    onSuccess: (writtenContent) => {
      if (writtenContent === undefined) return;
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
    diskContent.current = null;
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

  // External-change detection for the currently open file. Every read of the
  // file lands in the fileContent query — the initial load, a background
  // refetch (window focus, reopening a cached file) and the fs listener
  // below — so this one effect sees them all. A read matching diskContent is
  // nothing new. Otherwise, with no unsaved edits the new content is folded
  // into the live document (see MarkdownEditor's externalReload) so the user
  // keeps their scroll position, cursor and undo history; with unsaved edits
  // a conflict banner is raised rather than clobbering local changes.
  useEffect(() => {
    if (!selectedFilePath || initialContent === undefined) return;
    if (diskContent.current === null) {
      diskContent.current = initialContent;
      return;
    }
    if (initialContent === diskContent.current) return;
    diskContent.current = initialContent;

    if (dirtyRef.current) {
      // Disk already holds exactly the unsaved text: nothing is in conflict.
      if (initialContent !== pendingContent.current) setConflict(true);
      return;
    }
    pendingContent.current = null;
    setExternalReload((prev) => ({ text: initialContent, token: (prev?.token ?? 0) + 1 }));
  }, [selectedFilePath, initialContent]);

  useEffect(() => {
    if (!selectedFilePath) return;
    let disposed = false;

    const unlistenPromise = listen<FsChangedPayload>("fs://changed", (event) => {
      if (disposed) return;
      if (!event.payload.paths.includes(selectedFilePath)) return;

      readSettledFile(selectedFilePath).then((freshContent) => {
        if (disposed || freshContent === null) return;
        queryClient.setQueryData(["fileContent", selectedFilePath], freshContent);
      });
    });

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [selectedFilePath, queryClient]);

  function handleExport(kind: ExportKind) {
    requestExport(kind, selectedFilePath);
  }

  async function discardAndReload() {
    if (!selectedFilePath) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setConflict(false);
    setDirty(false);
    pendingContent.current = null;
    const freshContent = await readSettledFile(selectedFilePath);
    if (freshContent === null) return;
    diskContent.current = freshContent;
    queryClient.setQueryData(["fileContent", selectedFilePath], freshContent);
    setExternalReload((prev) => ({ text: freshContent, token: (prev?.token ?? 0) + 1 }));
  }

  function keepMine() {
    setConflict(false);
    // The autosave that came due while the banner was up was skipped.
    if (selectedFilePath) saveMutation.mutate(selectedFilePath);
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
                onClick={keepMine}
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

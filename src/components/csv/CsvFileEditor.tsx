import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { readFile, writeFile } from "@/lib/tauri-commands";
import { readSettledFile } from "@/lib/readSettledFile";
import { CsvModel } from "@/lib/csv";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { PanelVisibilityToggles } from "@/components/layout/PanelVisibilityToggles";
import type { FsChangedPayload } from "@/hooks/useFsWatcher";
import { CsvTable } from "./CsvTable";
import { useCsvPrefs } from "./csvPrefs";
import editorStyles from "@/components/editor/FileEditor.module.css";
import toolbarStyles from "@/components/editor/WidthToolbar.module.css";
import styles from "./CsvTable.module.css";

const AUTOSAVE_DELAY_MS = 1500;
const numberFormat = new Intl.NumberFormat();

/**
 * A CSV file open in the table view. Mounted per file (keyed by path), so
 * all state below belongs to one file.
 *
 * Saving follows the markdown editor's rules: debounced autosave through the
 * atomic write, a record of what we believe is on disk so our own write
 * echoing back through the watcher isn't mistaken for an external change, a
 * silent reload when the file changes underneath us with nothing unsaved,
 * and a conflict banner when it changes while edits are pending. Unlike the
 * markdown side, a pending save is flushed — not dropped — when the file is
 * closed or another one is opened.
 */
export function CsvFileEditor({ path }: { path: string }) {
  const queryClient = useQueryClient();
  const fullscreenActive = useUiStore((s) => s.fullscreenActive);
  const wrap = useCsvPrefs((s) => s.wrap);
  const toggleWrap = useCsvPrefs((s) => s.toggleWrap);

  const { data: content, isError } = useQuery({
    queryKey: ["fileContent", path],
    queryFn: () => readFile(path),
  });
  useEffect(() => {
    if (isError) useWorkspaceStore.getState().selectFile(null);
  }, [isError]);

  const [model, setModel] = useState<CsvModel | null>(null);
  // The model is mutated in place; this counter is what tells React it changed.
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflictState] = useState(false);

  const modelRef = useRef<CsvModel | null>(null);
  modelRef.current = model;
  const diskContent = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every edit, so a write that finishes after a newer edit
  // doesn't clear the dirty flag that edit set.
  const editSeq = useRef(0);

  function setConflict(value: boolean) {
    conflictRef.current = value;
    setConflictState(value);
  }
  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }

  const save = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const current = modelRef.current;
    if (!current || !dirtyRef.current || conflictRef.current) return;
    const seq = editSeq.current;
    const text = current.serialize();
    // Recorded before the write so a read racing it recognizes these bytes.
    diskContent.current = text;
    queryClient.setQueryData(["fileContent", path], text);
    await writeFile(path, text);
    if (editSeq.current === seq) markDirty(false);
    queryClient.invalidateQueries({ queryKey: ["markdownFiles"] });
  }, [path, queryClient]);

  // Flush on close / switching files. `save` reads refs only, so the latest
  // edits are written even though this cleanup was created on first render.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => void saveRef.current(), []);

  // Every read of the file lands in the query: the first load, refetches and
  // the watcher below. A read that matches what we wrote is nothing new.
  useEffect(() => {
    if (content === undefined) return;
    if (diskContent.current === content) return;
    const first = diskContent.current === null;
    diskContent.current = content;
    if (!first && dirtyRef.current) {
      setConflict(true);
      return;
    }
    setModel(CsvModel.fromText(content));
    setVersion((v) => v + 1);
  }, [content]);

  useEffect(() => {
    let disposed = false;
    const unlistenPromise = listen<FsChangedPayload>("fs://changed", (event) => {
      if (disposed || !event.payload.paths.includes(path)) return;
      readSettledFile(path).then((fresh) => {
        if (!disposed && fresh !== null) queryClient.setQueryData(["fileContent", path], fresh);
      });
    });
    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [path, queryClient]);

  const handleChange = useCallback(() => {
    editSeq.current++;
    markDirty(true);
    setVersion((v) => v + 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY_MS);
  }, []);

  async function reloadFromDisk() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setConflict(false);
    markDirty(false);
    const fresh = await readSettledFile(path);
    if (fresh === null) return;
    diskContent.current = fresh;
    queryClient.setQueryData(["fileContent", path], fresh);
    setModel(CsvModel.fromText(fresh));
    setVersion((v) => v + 1);
  }

  function keepMine() {
    setConflict(false);
    void save();
  }

  return (
    <div className={editorStyles.wrapper}>
      {!fullscreenActive && (
        <div className={toolbarStyles.toolbar} data-tauri-drag-region>
          <div className={toolbarStyles.side}>
            <PanelVisibilityToggles />
            <span className={toolbarStyles.dirtyDot} data-visible={dirty} title="Unsaved changes" />
          </div>
          <div className={`${toolbarStyles.side} ${toolbarStyles.sideEnd}`}>
            <button
              type="button"
              className={styles.toolButton}
              data-active={wrap}
              aria-pressed={wrap}
              onClick={toggleWrap}
              // Keep focus (and the cursor) in the table.
              onMouseDown={(e) => e.preventDefault()}
              title={wrap ? "Word wrap on (⌥Z)" : "Word wrap off (⌥Z)"}
              aria-label="Word wrap"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4H13.5M2.5 8H11.25A2.25 2.25 0 0 1 11.25 12.5H8.5M2.5 12.5H5.5M9.75 11 8.25 12.5 9.75 14"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {model && (
              <span className={styles.stats}>
                {numberFormat.format(model.rowCount)} {model.rowCount === 1 ? "row" : "rows"}
                <span className={styles.statsSep}>×</span>
                {model.columnCount} {model.columnCount === 1 ? "column" : "columns"}
              </span>
            )}
          </div>
        </div>
      )}
      <div className={editorStyles.body}>
        <div className={editorStyles.editorPane}>
          {conflict && (
            <div className={editorStyles.conflictBanner}>
              <span>This file changed on disk.</span>
              <button type="button" onClick={reloadFromDisk} title="Discard your local changes and reload from disk">
                Reload
              </button>
              <button type="button" onClick={keepMine} title="Dismiss this notice and keep your local changes">
                Keep mine
              </button>
            </div>
          )}
          {model ? (
            <CsvTable model={model} version={version} onChange={handleChange} />
          ) : (
            <div className={editorStyles.loading}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

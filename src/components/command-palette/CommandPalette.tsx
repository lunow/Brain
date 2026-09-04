import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addRootFolder,
  getWorkspaceRoots,
  listAllFolders,
  listMarkdownFiles,
  pickFolder,
} from "@/lib/tauri-commands";
import { useUiStore } from "@/stores/ui";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useExport } from "@/hooks/useExport";
import { useListKeyboardNav } from "@/hooks/useListKeyboardNav";
import { buildCommands, buildResultGroups, parentDirOf, type FolderResult, type FileResult, type PaletteResult } from "./commandPalette.logic";
import { CommandPaletteResults } from "./CommandPaletteResults";
import styles from "./CommandPalette.module.css";

/**
 * Cmd+K jump-to-anything palette: searches every folder, subfolder, and
 * markdown file across all workspace roots, plus a flat, easy-to-extend
 * list of commands (new file/folder, width presets, export). Add future
 * commands to `buildCommands` in commandPalette.logic.ts — everything else
 * here (data wiring, keyboard nav, rendering) is generic and delegated to
 * commandPalette.logic.ts / useListKeyboardNav / CommandPaletteResults.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeCommandPalette);
  const setWidthPreset = useUiStore((s) => s.setWidthPreset);
  const setWritingMode = useUiStore((s) => s.setWritingMode);
  const writingMode = useUiStore((s) => s.writingMode);
  const treeVisible = useUiStore((s) => s.treeVisible);
  const toggleTreeVisible = useUiStore((s) => s.toggleTreeVisible);
  const fileListVisible = useUiStore((s) => s.fileListVisible);
  const toggleFileListVisible = useUiStore((s) => s.toggleFileListVisible);
  const rightSidebarVisible = useUiStore((s) => s.rightSidebarVisible);
  const toggleRightSidebarVisible = useUiStore((s) => s.toggleRightSidebarVisible);

  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const selectFile = useWorkspaceStore((s) => s.selectFile);

  const { createFileMutation, createFolderMutation } = useFileOperations();
  const { requestExport } = useExport();

  const queryClient = useQueryClient();
  const addRoot = useMutation({
    mutationFn: async () => {
      const path = await pickFolder();
      if (!path) return null;
      return addRootFolder(path);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceRoots"] }),
  });

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Not gated on `open`: warms up as soon as workspace roots are known (app
  // start, or a root added/removed) rather than making the first Cmd+K
  // press of a session pay for the fetch synchronously. Subsequent opens
  // just read the cache; react-query's default staleTime of 0 still
  // refetches in the background on every open so new/renamed files show up
  // without a manual invalidation hook.
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots });

  const { data: navIndex, isLoading: navLoading } = useQuery({
    queryKey: ["commandPaletteIndex", roots?.map((r) => r.id).join(",")],
    enabled: !!roots,
    queryFn: async () => {
      const list = roots ?? [];
      const perRoot = await Promise.all(
        list.map(async (root) => {
          const [subfolders, files] = await Promise.all([
            listAllFolders(root.path),
            // No preview needed here — this index only surfaces name/path,
            // so skip reading every file's content across every root.
            listMarkdownFiles(root.path, true, false),
          ]);
          const folders: FolderResult[] = [
            { type: "folder", name: root.displayName, path: root.path, rootPath: root.path },
            ...subfolders.map((f): FolderResult => ({ type: "folder", name: f.name, path: f.path, rootPath: root.path })),
          ];
          const fileResults: FileResult[] = files.map((f) => ({
            type: "file",
            name: f.name,
            path: f.path,
            rootPath: root.path,
          }));
          return { folders, files: fileResults };
        }),
      );
      return {
        folders: perRoot.flatMap((r) => r.folders),
        files: perRoot.flatMap((r) => r.files),
      };
    },
  });

  const commands = useMemo(
    () =>
      buildCommands({
        treeVisible,
        fileListVisible,
        rightSidebarVisible,
        createFile: () => selectedFolderPath && createFileMutation.mutate(selectedFolderPath),
        createFolder: () => selectedFolderPath && createFolderMutation.mutate(selectedFolderPath),
        addRoot: () => addRoot.mutate(),
        setWritingMode,
        toggleTreeVisible,
        toggleFileListVisible,
        toggleRightSidebarVisible,
        setWidthPreset,
        requestExport: (kind) => requestExport(kind, selectedFilePath),
      }),
    // Mutation/store action functions are stable across renders; only their
    // captured values need to retrigger a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedFolderPath, selectedFilePath, treeVisible, fileListVisible, rightSidebarVisible],
  );

  const groups = useMemo(
    () =>
      buildResultGroups({
        query,
        commands,
        navIndex,
        selectedFolderPath,
        selectedFilePath,
        writingMode,
        treeVisible,
        fileListVisible,
      }),
    [query, commands, navIndex, selectedFolderPath, selectedFilePath, writingMode, treeVisible, fileListVisible],
  );

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  function runResult(item: PaletteResult) {
    if (item.type === "command") {
      item.run();
      close();
    } else if (item.type === "folder") {
      selectFolder(item.path);
      close();
    } else {
      const parentDir = parentDirOf(item.path);
      // selectFolder clears the file selection, so it must run first.
      selectFolder(parentDir);
      selectFile(item.path);
      close();
    }
  }

  const { activeIndex, setActiveIndex, activeItemRef } = useListKeyboardNav({
    active: open,
    items: flat,
    onSelect: runResult,
    onEscape: close,
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    // Focus after the panel mounts.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, setActiveIndex]);

  if (!open) return null;

  const trimmed = query.trim();
  const searching = navLoading && !!trimmed && groups.every((g) => g.label !== "Folders" && g.label !== "Files");

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files, folders, and commands…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <CommandPaletteResults
          groups={groups}
          activeIndex={activeIndex}
          activeItemRef={activeItemRef}
          searching={searching}
          onHover={setActiveIndex}
          onSelect={runResult}
        />
      </div>
    </div>
  );
}

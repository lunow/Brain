import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFile, createFolder, deleteEntry, duplicateEntry, moveEntry, renameEntry } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";

function parentDirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

/**
 * Centralizes CRUD mutations + their cache invalidation and selection-state
 * syncing, so the tree and the file list (which both act on the same
 * filesystem entries) don't duplicate this bookkeeping.
 */
export function useFileOperations() {
  const queryClient = useQueryClient();
  // Selection is read imperatively inside the callbacks rather than
  // subscribed to. Every row of the Content tree calls this hook, so
  // subscribing to selectedFilePath/selectedFolderPath re-rendered the whole
  // tree on every file selection — a few hundred rows per click, purely so
  // that a mutation's onSuccess could compare against the current selection.
  // The store actions below are stable references and are safe to subscribe.
  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const selectFile = useWorkspaceStore((s) => s.selectFile);
  const stopRename = useWorkspaceStore((s) => s.stopRename);

  function invalidateDir(dir: string) {
    queryClient.invalidateQueries({ queryKey: ["dirChildren", dir] });
    queryClient.invalidateQueries({ queryKey: ["markdownFiles", dir] });
  }

  const createFileMutation = useMutation({
    mutationFn: (parentDir: string) => createFile(parentDir, "Untitled"),
    onSuccess: (entry, parentDir) => {
      invalidateDir(parentDir);
      selectFile(entry.path);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (parentDir: string) => createFolder(parentDir, "New Folder"),
    onSuccess: (_entry, parentDir) => invalidateDir(parentDir),
  });

  const renameMutation = useMutation({
    mutationFn: ({ path, newName }: { path: string; newName: string }) => renameEntry(path, newName),
    onSuccess: (newPath, { path }) => {
      invalidateDir(parentDirOf(path));
      const { selectedFilePath, selectedFolderPath } = useWorkspaceStore.getState();
      if (selectedFilePath === path) selectFile(newPath);
      if (selectedFolderPath === path) selectFolder(newPath);
      stopRename();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteEntry(path),
    onSuccess: (_result, path) => {
      invalidateDir(parentDirOf(path));
      const { selectedFilePath, selectedFolderPath } = useWorkspaceStore.getState();
      if (selectedFilePath === path) selectFile(null);
      if (selectedFolderPath === path) selectFolder(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ srcPath, destDir }: { srcPath: string; destDir: string }) => moveEntry(srcPath, destDir),
    onSuccess: (newPath, { srcPath, destDir }) => {
      invalidateDir(parentDirOf(srcPath));
      invalidateDir(destDir);
      if (useWorkspaceStore.getState().selectedFilePath === srcPath) selectFile(newPath);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (path: string) => duplicateEntry(path),
    onSuccess: (entry, path) => {
      invalidateDir(parentDirOf(path));
      selectFile(entry.path);
    },
  });

  return {
    createFileMutation,
    createFolderMutation,
    renameMutation,
    deleteMutation,
    moveMutation,
    duplicateMutation,
  };
}

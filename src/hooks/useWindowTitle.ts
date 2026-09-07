import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getWorkspaceRoots } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

/**
 * Keeps the native macOS window title in sync with the current selection as
 * a "Workspace / Folder / File" breadcrumb — visible in Mission Control,
 * Cmd+`, and the Window/Dock menus, and (titleBarStyle Overlay, hiddenTitle
 * false) painted in the title bar itself alongside the floating traffic
 * lights.
 */
export function useWindowTitle() {
  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots });

  useEffect(() => {
    // A file selected deep in the FileTree (subfolders view) never updates
    // selectedFolderPath — that only tracks the tree sidebar's selection,
    // which can sit at the workspace root while the open file is several
    // levels below it. The file's own directory is the source of truth for
    // which folder it's actually in.
    const folderPath = selectedFilePath ? dirname(selectedFilePath) : selectedFolderPath;
    const root = roots?.find((r) => folderPath === r.path || folderPath?.startsWith(`${r.path}/`));

    const parts: string[] = [];
    if (root) parts.push(root.displayName);
    if (folderPath && folderPath !== root?.path) {
      // Every subfolder between the workspace root and folderPath, not just
      // the immediate one — e.g. root/notes/2026/september pushes "notes",
      // "2026", "september" as separate breadcrumb segments.
      const relative = root ? folderPath.slice(root.path.length).replace(/^\//, "") : basename(folderPath);
      parts.push(...relative.split("/").filter(Boolean));
    }
    if (selectedFilePath) parts.push(basename(selectedFilePath).replace(/\.md$/, ""));

    const title = parts.length > 0 ? parts.join(" → ") : "Brain";
    getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [roots, selectedFolderPath, selectedFilePath]);
}

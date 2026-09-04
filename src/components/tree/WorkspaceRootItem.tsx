import { useQuery } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { getFolderStats, revealInFinder, type RootFolder } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFileOperations } from "@/hooks/useFileOperations";
import { ContextMenu, type ContextMenuEntry } from "@/components/common/ContextMenu";
import { InlineRenameInput } from "@/components/common/InlineRenameInput";
import { FolderIcon } from "@/components/common/icons";
import { formatRelativeTime } from "@/lib/relativeTime";
import { displayPath } from "./displayPath";
import styles from "./WorkspaceRootItem.module.css";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function statsLine(stats: { folderCount: number; fileCount: number; lastModifiedAt: number | null } | undefined): string {
  if (!stats) return "";
  const parts = [pluralize(stats.folderCount, "folder"), pluralize(stats.fileCount, "file")];
  if (stats.lastModifiedAt !== null) parts.push(`last change: ${formatRelativeTime(stats.lastModifiedAt)}`);
  return parts.join(", ");
}

interface WorkspaceRootItemProps {
  root: RootFolder;
  homeDir?: string;
  onRemoveRoot: () => void;
}

export function WorkspaceRootItem({ root, homeDir, onRemoveRoot }: WorkspaceRootItemProps) {
  const isSelected = useWorkspaceStore((s) => s.selectedFolderPath === root.path);
  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const isRenaming = useWorkspaceStore((s) => s.renamingPath === root.path);
  const startRename = useWorkspaceStore((s) => s.startRename);
  const stopRename = useWorkspaceStore((s) => s.stopRename);

  const { createFileMutation, createFolderMutation, renameMutation, deleteMutation } = useFileOperations();

  const { data: stats } = useQuery({
    queryKey: ["folderStats", root.path],
    queryFn: () => getFolderStats(root.path),
    staleTime: 5_000,
  });

  const { isOver, setNodeRef } = useDroppable({ id: `folder:${root.path}`, data: { kind: "folder", path: root.path } });

  const menuItems: ContextMenuEntry[] = [
    { label: "New File", onSelect: () => createFileMutation.mutate(root.path) },
    { label: "New Subfolder", onSelect: () => createFolderMutation.mutate(root.path) },
    "separator",
    { label: "Rename", onSelect: () => startRename(root.path) },
    { label: "Reveal in Finder", onSelect: () => revealInFinder(root.path) },
    "separator",
    { label: "Delete", onSelect: () => deleteMutation.mutate(root.path) },
    "separator",
    { label: "Remove from Sidebar", onSelect: onRemoveRoot },
  ];

  return (
    <ContextMenu items={menuItems}>
      <div
        ref={setNodeRef}
        role="button"
        tabIndex={0}
        className={`${styles.row} ${isSelected ? styles.rowSelected : ""} ${isOver ? styles.rowDropTarget : ""}`}
        onClick={() => selectFolder(root.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectFolder(root.path);
          } else if (e.key === "F2") {
            e.preventDefault();
            startRename(root.path);
          } else if ((e.key === "Delete" || e.key === "Backspace") && isSelected) {
            e.preventDefault();
            deleteMutation.mutate(root.path);
          }
        }}
      >
        <FolderIcon className={styles.folderIcon} />
        <div className={styles.labelColumn}>
          {isRenaming ? (
            <InlineRenameInput
              initialName={root.displayName}
              onCommit={(newName) => renameMutation.mutate({ path: root.path, newName })}
              onCancel={stopRename}
            />
          ) : (
            <span className={styles.name}>{root.displayName}</span>
          )}
          <span className={styles.path}>{displayPath(root.path, homeDir)}</span>
          <span className={styles.stats}>{statsLine(stats)}</span>
        </div>
      </div>
    </ContextMenu>
  );
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDraggable } from "@dnd-kit/core";
import { listMarkdownFiles, revealInFinder, type MarkdownFileEntry } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFileOperations } from "@/hooks/useFileOperations";
import { ContextMenu, type ContextMenuEntry } from "@/components/common/ContextMenu";
import { InlineRenameInput } from "@/components/common/InlineRenameInput";
import { SubfoldersIcon } from "@/components/common/icons";
import { FileTree } from "./FileTree";
import styles from "./FileList.module.css";

export function FileRow({ file, depth = 0 }: { file: MarkdownFileEntry; depth?: number }) {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const selectFile = useWorkspaceStore((s) => s.selectFile);
  const isRenaming = useWorkspaceStore((s) => s.renamingPath === file.path);
  const startRename = useWorkspaceStore((s) => s.startRename);
  const stopRename = useWorkspaceStore((s) => s.stopRename);
  const { renameMutation, deleteMutation, duplicateMutation } = useFileOperations();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file:${file.path}`,
    data: { kind: "file", path: file.path },
  });

  const isSelected = selectedFilePath === file.path;

  const menuItems: ContextMenuEntry[] = [
    { label: "Rename", onSelect: () => startRename(file.path) },
    { label: "Duplicate", onSelect: () => duplicateMutation.mutate(file.path) },
    { label: "Reveal in Finder", onSelect: () => revealInFinder(file.path) },
    "separator",
    { label: "Delete", onSelect: () => deleteMutation.mutate(file.path) },
  ];

  return (
    <ContextMenu items={menuItems}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
        style={{ opacity: isDragging ? 0.4 : 1, paddingLeft: `calc(var(--space-3) + ${depth * 14}px)` }}
        onClick={() => selectFile(file.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectFile(file.path);
          } else if (e.key === "F2") {
            e.preventDefault();
            startRename(file.path);
          } else if ((e.key === "Delete" || e.key === "Backspace") && isSelected) {
            e.preventDefault();
            deleteMutation.mutate(file.path);
          }
        }}
      >
        {isRenaming ? (
          <InlineRenameInput
            initialName={file.name}
            onCommit={(newName) => renameMutation.mutate({ path: file.path, newName })}
            onCancel={stopRename}
          />
        ) : (
          <div className={styles.name}>{file.name}</div>
        )}
        {file.preview && <div className={styles.preview}>{file.preview}</div>}
      </div>
    </ContextMenu>
  );
}

export function FileList() {
  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const includeSubfolders = useWorkspaceStore((s) => s.includeSubfolders);
  const toggleIncludeSubfolders = useWorkspaceStore((s) => s.toggleIncludeSubfolders);
  const { createFileMutation } = useFileOperations();

  const { data: files, isLoading } = useQuery({
    queryKey: ["markdownFiles", selectedFolderPath, includeSubfolders],
    queryFn: () => listMarkdownFiles(selectedFolderPath as string, includeSubfolders),
    enabled: !!selectedFolderPath,
  });

  const sortedFiles = useMemo(() => (files ? [...files].sort((a, b) => a.path.localeCompare(b.path)) : files), [files]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Content</span>
        <div className={styles.headerActions}>
          {selectedFolderPath && (
            <button
              type="button"
              className={styles.toggle}
              data-active={includeSubfolders}
              onClick={toggleIncludeSubfolders}
              aria-pressed={includeSubfolders}
              title={`${includeSubfolders ? "Hide" : "Include"} subfolders`}
            >
              <SubfoldersIcon />
            </button>
          )}
          {selectedFolderPath && (
            <button
              type="button"
              className={styles.addButton}
              onClick={() => createFileMutation.mutate(selectedFolderPath)}
              aria-label="New file"
              title="New file (⌘N)"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {!selectedFolderPath && <div className={styles.empty}>Select a folder to see its files.</div>}
        {selectedFolderPath && isLoading && <div className={styles.empty}>Loading…</div>}
        {selectedFolderPath && !isLoading && files?.length === 0 && (
          <div className={styles.empty}>No markdown files here.</div>
        )}

        <div>
          {selectedFolderPath && includeSubfolders && files && files.length > 0 ? (
            <FileTree rootPath={selectedFolderPath} />
          ) : (
            sortedFiles?.map((file) => <FileRow key={file.path} file={file} />)
          )}
        </div>
      </div>
    </div>
  );
}

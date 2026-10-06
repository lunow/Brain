import { useWorkspaceStore } from "@/stores/workspace";
import { useFileOperations } from "@/hooks/useFileOperations";
import { NewFileIcon, NewFolderIcon } from "@/components/common/icons";
import { FileTree } from "./FileTree";
import styles from "./FileList.module.css";

/**
 * The Content column: a header plus the folder/file tree for the workspace
 * root selected over in the Workspaces column.
 *
 * There's deliberately no flat-list mode and no "include subfolders" toggle
 * any more — a collapsed folder already hides its contents, which is all
 * that toggle did, and one presentation keeps drag-and-drop targets and
 * row geometry consistent.
 */
export function FileList() {
  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const { createFileMutation, createFolderMutation } = useFileOperations();

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Content</span>
        {selectedFolderPath && (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => createFolderMutation.mutate(selectedFolderPath)}
              aria-label="New folder"
              title="New folder"
            >
              <NewFolderIcon />
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => createFileMutation.mutate(selectedFolderPath)}
              aria-label="New file"
              title="New file (⌘N)"
            >
              <NewFileIcon />
            </button>
          </div>
        )}
      </div>

      <div className={styles.content}>
        {selectedFolderPath ? (
          <FileTree key={selectedFolderPath} rootPath={selectedFolderPath} />
        ) : (
          <div className={styles.empty}>Select a folder to see its files.</div>
        )}
      </div>
    </div>
  );
}

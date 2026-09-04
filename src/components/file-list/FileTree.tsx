import { useQuery } from "@tanstack/react-query";
import { listDirChildren, listMarkdownFiles, type DirEntryLite } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { FolderIcon, FolderOpenIcon } from "@/components/common/icons";
import { FileRow } from "./FileList";
import styles from "./FileTree.module.css";

function sortByName<T extends { name: string }>(entries: T[] | undefined): T[] | undefined {
  return entries ? [...entries].sort((a, b) => a.name.localeCompare(b.name)) : entries;
}

function FileTreeFolder({ path, name, depth }: { path: string; name: string; depth: number }) {
  const isExpanded = useWorkspaceStore((s) => s.expandedFileTreePaths.has(path));
  const toggleExpanded = useWorkspaceStore((s) => s.toggleFileTreeExpanded);

  const { data: children } = useQuery({
    queryKey: ["dirChildren", path],
    queryFn: () => listDirChildren(path),
    enabled: isExpanded,
    staleTime: 5_000,
  });
  const { data: files } = useQuery({
    queryKey: ["markdownFiles", path, false],
    queryFn: () => listMarkdownFiles(path, false),
    enabled: isExpanded,
  });

  const subfolders = sortByName(children?.filter((c) => c.isDir));
  const sortedFiles = files ? [...files].sort((a, b) => a.name.localeCompare(b.name)) : files;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className={styles.folderRow}
        style={{ paddingLeft: `calc(var(--space-3) + ${depth * 14}px)` }}
        onClick={() => toggleExpanded(path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded(path);
          }
        }}
      >
        {isExpanded ? (
          <FolderOpenIcon className={styles.folderIcon} />
        ) : (
          <FolderIcon className={styles.folderIcon} />
        )}
        <span className={styles.folderName}>{name}</span>
      </div>
      {isExpanded && (
        <div>
          {subfolders?.map((f) => <FileTreeFolder key={f.path} path={f.path} name={f.name} depth={depth + 1} />)}
          {sortedFiles?.map((file) => <FileRow key={file.path} file={file} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

/** Folder + file tree for the middle column, shown in place of the flat
 *  file list when "Subfolders" is on. */
export function FileTree({ rootPath }: { rootPath: string }) {
  const { data: children } = useQuery({
    queryKey: ["dirChildren", rootPath],
    queryFn: () => listDirChildren(rootPath),
  });
  const { data: files } = useQuery({
    queryKey: ["markdownFiles", rootPath, false],
    queryFn: () => listMarkdownFiles(rootPath, false),
  });

  const subfolders: DirEntryLite[] | undefined = sortByName(children?.filter((c) => c.isDir));
  const sortedFiles = files ? [...files].sort((a, b) => a.name.localeCompare(b.name)) : files;

  return (
    <div>
      {subfolders?.map((f) => <FileTreeFolder key={f.path} path={f.path} name={f.name} depth={0} />)}
      {sortedFiles?.map((file) => <FileRow key={file.path} file={file} depth={0} />)}
    </div>
  );
}

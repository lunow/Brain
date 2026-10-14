import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  listDirChildren,
  listMarkdownFiles,
  revealInFinder,
  type DirEntryLite,
  type MarkdownFileEntry,
} from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFileOperations } from "@/hooks/useFileOperations";
import { ContextMenu, type ContextMenuEntry } from "@/components/common/ContextMenu";
import { InlineRenameInput } from "@/components/common/InlineRenameInput";
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from "@/components/common/icons";
import styles from "./FileTree.module.css";

/**
 * Natural, case-insensitive ordering — so "Chapter 2" sorts before
 * "Chapter 10" rather than after it, the way Finder orders them. Built once
 * at module scope: constructing an Intl.Collator is comparatively expensive
 * and every open folder re-sorts on render.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function byName<T extends { name: string }>(entries: T[] | undefined): T[] {
  return entries ? [...entries].sort((a, b) => collator.compare(a.name, b.name)) : [];
}

/**
 * Depth is published to CSS as a custom property rather than baked into an
 * inline `padding-left`, so the indent step itself stays a token
 * (`--tree-indent`) and the nesting guides in FileTree.module.css can be
 * positioned off the same number.
 */
function depthVar(depth: number): CSSProperties {
  return { "--depth": depth } as CSSProperties;
}


/* --- Arrow-key navigation ---------------------------------------------
 * Walks the rendered rows rather than a parallel flattened model: the DOM
 * already holds exactly the rows that are visible, in visual order, with
 * collapsed subtrees absent — so there's no second structure to keep in
 * sync with the expand state and the lazy folder queries.
 */

/** Every row currently visible in the tree, in visual order. */
function visibleRows(from: HTMLElement): HTMLElement[] {
  const root = from.closest("[data-tree-root]");
  return root ? Array.from(root.querySelectorAll<HTMLElement>("[data-tree-row]")) : [];
}

function focusRelative(from: HTMLElement, delta: number) {
  const rows = visibleRows(from);
  const index = rows.indexOf(from);
  if (index === -1) return;
  rows[index + delta]?.focus();
}

function focusEdge(from: HTMLElement, edge: "first" | "last") {
  const rows = visibleRows(from);
  (edge === "first" ? rows[0] : rows[rows.length - 1])?.focus();
}

/** The nearest row above this one that sits a level shallower — i.e. the
 *  folder containing it. */
function focusParent(from: HTMLElement) {
  const rows = visibleRows(from);
  const index = rows.indexOf(from);
  const depth = Number(from.dataset.depth ?? 0);
  for (let i = index - 1; i >= 0; i--) {
    if (Number(rows[i].dataset.depth ?? 0) < depth) {
      rows[i].focus();
      return;
    }
  }
}

/** ArrowUp/ArrowDown/Home/End, shared by folder and file rows. Returns true
 *  if the key was one of them, so callers can stop there. */
function handleVerticalNav(e: React.KeyboardEvent<HTMLElement>): boolean {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusRelative(e.currentTarget, 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusRelative(e.currentTarget, -1);
  } else if (e.key === "Home") {
    e.preventDefault();
    focusEdge(e.currentTarget, "first");
  } else if (e.key === "End") {
    e.preventDefault();
    focusEdge(e.currentTarget, "last");
  } else {
    return false;
  }
  return true;
}


/**
 * The file operations a tree row needs, provided once by FileTree.
 *
 * Each row used to call useFileOperations() itself, which builds six
 * useMutation hooks — several thousand hook instances across a deep tree,
 * for five callbacks that are identical everywhere. The context value is
 * memoized on React Query's stable `mutate` references, so it never changes
 * identity and consuming it costs a row nothing.
 */
interface TreeOps {
  createFile: (parentDir: string) => void;
  createFolder: (parentDir: string) => void;
  rename: (path: string, newName: string) => void;
  remove: (path: string) => void;
  duplicate: (path: string) => void;
}

const TreeOpsContext = createContext<TreeOps | null>(null);

function useTreeOps(): TreeOps {
  const ops = useContext(TreeOpsContext);
  if (!ops) throw new Error("Tree rows must be rendered inside <FileTree>");
  return ops;
}

function TreeOpsProvider({ children }: { children: ReactNode }) {
  const { createFileMutation, createFolderMutation, renameMutation, deleteMutation, duplicateMutation } =
    useFileOperations();

  const value = useMemo<TreeOps>(
    () => ({
      createFile: (parentDir) => createFileMutation.mutate(parentDir),
      createFolder: (parentDir) => createFolderMutation.mutate(parentDir),
      rename: (path, newName) => renameMutation.mutate({ path, newName }),
      remove: (path) => deleteMutation.mutate(path),
      duplicate: (path) => duplicateMutation.mutate(path),
    }),
    [
      createFileMutation.mutate,
      createFolderMutation.mutate,
      renameMutation.mutate,
      deleteMutation.mutate,
      duplicateMutation.mutate,
    ],
  );

  return <TreeOpsContext.Provider value={value}>{children}</TreeOpsContext.Provider>;
}

function TreeFileRow({ file, depth }: { file: MarkdownFileEntry; depth: number }) {
  const isSelected = useWorkspaceStore((s) => s.selectedFilePath === file.path);
  const selectFile = useWorkspaceStore((s) => s.selectFile);
  const isRenaming = useWorkspaceStore((s) => s.renamingPath === file.path);
  const startRename = useWorkspaceStore((s) => s.startRename);
  const stopRename = useWorkspaceStore((s) => s.stopRename);
  const ops = useTreeOps();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag:${file.path}`,
    data: { kind: "file", path: file.path },
  });

  // The row needs a ref of its own alongside dnd-kit's, so it can bring
  // itself into view when it becomes the selected file — which is how a
  // jump from the command palette lands on screen. The effect fires on
  // mount too, so a row that only appears once its ancestors have been
  // expanded still scrolls in as soon as it renders.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [isSelected]);

  const menuItems: ContextMenuEntry[] = [
    { label: "Rename", onSelect: () => startRename(file.path) },
    { label: "Duplicate", onSelect: () => ops.duplicate(file.path) },
    { label: "Reveal in Finder", onSelect: () => revealInFinder(file.path) },
    "separator",
    { label: "Delete", onSelect: () => ops.remove(file.path) },
  ];

  return (
    <ContextMenu items={menuItems}>
      <div
        ref={setRowRef}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        className={styles.row}
        style={depthVar(depth)}
        data-tree-row=""
        data-depth={depth}
        data-selected={isSelected}
        data-dragging={isDragging}
        // Rows are nested inside the tree's own context-menu trigger, and
        // Radix opens a trigger on the bubbled event as readily as on a
        // direct one — without this, right-clicking a row would open both
        // this menu and the tree-background menu. Radix composes the
        // child's handler ahead of its own, so its open still runs.
        onContextMenu={(e) => e.stopPropagation()}
        onClick={() => selectFile(file.path)}
        onDoubleClick={() => startRename(file.path)}
        onKeyDown={(e) => {
          if (handleVerticalNav(e)) return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            focusParent(e.currentTarget);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectFile(file.path);
          } else if (e.key === "F2") {
            e.preventDefault();
            startRename(file.path);
          } else if ((e.key === "Delete" || e.key === "Backspace") && isSelected) {
            e.preventDefault();
            ops.remove(file.path);
          }
        }}
      >
        <span className={styles.disclosureSpacer} />
        <FileIcon className={styles.icon} />
        {isRenaming ? (
          <InlineRenameInput
            initialName={file.name}
            onCommit={(newName) => ops.rename(file.path, newName)}
            onCancel={stopRename}
          />
        ) : (
          <span className={styles.name}>{file.name}</span>
        )}
      </div>
    </ContextMenu>
  );
}

function TreeFolderRow({ path, name, depth }: { path: string; name: string; depth: number }) {
  const isExpanded = useWorkspaceStore((s) => s.expandedFileTreePaths.has(path));
  const toggleExpanded = useWorkspaceStore((s) => s.toggleFileTreeExpanded);
  const expandPath = useWorkspaceStore((s) => s.expandFileTreePath);
  const collapsePath = useWorkspaceStore((s) => s.collapseFileTreePath);
  const isRenaming = useWorkspaceStore((s) => s.renamingPath === path);
  const startRename = useWorkspaceStore((s) => s.startRename);
  const stopRename = useWorkspaceStore((s) => s.stopRename);
  const ops = useTreeOps();

  // Both children queries stay disabled until the folder is open, so the
  // tree only ever reads the directories the user actually unfolded.
  const { data: children } = useQuery({
    queryKey: ["dirChildren", path],
    queryFn: () => listDirChildren(path),
    enabled: isExpanded,
    staleTime: 5_000,
  });
  const { data: files } = useQuery({
    queryKey: ["markdownFiles", path, false],
    // includePreview: false. Nothing renders MarkdownFileEntry.preview any
    // more, and building it costs a full fs::read_to_string of every file in
    // the folder — repaid on every autosave and every fs-watcher event,
    // which invalidate ["markdownFiles"] wholesale.
    queryFn: () => listMarkdownFiles(path, false, false),
    enabled: isExpanded,
  });

  // A folder is both a drag source (it can be moved into another folder) and
  // a drop target (things can be moved into it). The droppable ref goes on a
  // wrapper around the row alone — never around the nested children — so
  // hovering a child doesn't also register as a hover on all its ancestors.
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop:${path}`,
    data: { kind: "folder", path },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `drag:${path}`, data: { kind: "folder", path } });

  // Memoized for the same reason FileTree memoizes its own: these re-sort
  // through an Intl.Collator, and a folder row re-renders whenever its own
  // selection or expand state changes.
  const sortedChildren = useMemo(() => byName(children), [children]);
  const sortedFiles = useMemo(() => byName(files), [files]);

  const menuItems: ContextMenuEntry[] = [
    {
      label: "New File",
      onSelect: () => {
        expandPath(path);
        ops.createFile(path);
      },
    },
    {
      label: "New Folder",
      onSelect: () => {
        expandPath(path);
        ops.createFolder(path);
      },
    },
    "separator",
    { label: "Rename", onSelect: () => startRename(path) },
    { label: "Reveal in Finder", onSelect: () => revealInFinder(path) },
    "separator",
    { label: "Delete", onSelect: () => ops.remove(path) },
  ];

  return (
    <div>
      <div ref={setDropRef}>
        <ContextMenu items={menuItems}>
          <div
            ref={setDragRef}
            {...listeners}
            {...attributes}
            role="button"
            tabIndex={0}
            className={styles.row}
            style={depthVar(depth)}
            data-tree-row=""
            data-depth={depth}
            data-drop-target={isOver}
            data-dragging={isDragging}
            onContextMenu={(e) => e.stopPropagation()}
            onClick={() => toggleExpanded(path)}
            // The two clicks behind a double-click have already toggled this
            // folder twice by the time this fires, so open/closed is back
            // where it started and only the rename needs opening.
            onDoubleClick={() => startRename(path)}
            onKeyDown={(e) => {
              if (handleVerticalNav(e)) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleExpanded(path);
              } else if (e.key === "ArrowRight") {
                // Standard tree semantics: open a closed folder, and step
                // into an already-open one (its first child is the next row).
                e.preventDefault();
                if (isExpanded) focusRelative(e.currentTarget, 1);
                else expandPath(path);
              } else if (e.key === "ArrowLeft") {
                // Mirror image: close an open folder, and step out of a
                // closed one to the folder containing it.
                e.preventDefault();
                if (isExpanded) collapsePath(path);
                else focusParent(e.currentTarget);
              } else if (e.key === "F2") {
                e.preventDefault();
                startRename(path);
              }
              // Deliberately no Delete/Backspace binding. Arrow navigation
              // moves focus without changing the selection, so a keyboard
              // delete here would recursively trash whichever folder the
              // cursor happened to land on — something the user never
              // selected. A file row can guard on isSelected (the file is
              // open in the editor); a folder has no equivalent state, so
              // deleting one goes through the context menu only.
            }}
          >
            <button
              type="button"
              className={styles.disclosure}
              data-expanded={isExpanded}
              // The row toggles too, so without this the chevron would fire
              // the toggle twice and cancel itself out.
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(path);
              }}
              tabIndex={-1}
              aria-hidden="true"
            >
              <ChevronRightIcon />
            </button>
            {isExpanded ? <FolderOpenIcon className={styles.icon} /> : <FolderIcon className={styles.icon} />}
            {isRenaming ? (
              <InlineRenameInput
                initialName={name}
                onCommit={(newName) => ops.rename(path, newName)}
                onCancel={stopRename}
              />
            ) : (
              <span className={styles.name}>{name}</span>
            )}
          </div>
        </ContextMenu>
      </div>

      {isExpanded && (
        <div className={styles.children} style={depthVar(depth)}>
          {sortedChildren.map((f) => (
            <TreeFolderRow key={f.path} path={f.path} name={f.name} depth={depth + 1} />
          ))}
          {sortedFiles.map((file) => (
            <TreeFileRow key={file.path} file={file} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Folder + file tree for the Content column. Folders come first at every
 * level, then files, each group ordered naturally by name — the filesystem
 * stores no ordering of its own, so this is the only order there is.
 */
export function FileTree({ rootPath }: { rootPath: string }) {
  return (
    <TreeOpsProvider>
      <FileTreeBody rootPath={rootPath} />
    </TreeOpsProvider>
  );
}

function FileTreeBody({ rootPath }: { rootPath: string }) {
  const rootOps = useTreeOps();
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const expandFileTreePaths = useWorkspaceStore((s) => s.expandFileTreePaths);

  // Reveal the selected file: open every folder between the root and it, so
  // a jump from the command palette (or any other programmatic selection)
  // lands on a visible row. The row itself handles scrolling once it exists.
  useEffect(() => {
    if (!selectedFilePath) return;
    const prefix = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
    if (!selectedFilePath.startsWith(prefix)) return;
    const segments = selectedFilePath.slice(prefix.length).split("/");
    segments.pop(); // the filename itself is not a folder to open
    if (segments.length === 0) return;
    const ancestors: string[] = [];
    let current = rootPath;
    for (const segment of segments) {
      current = `${current}/${segment}`;
      ancestors.push(current);
    }
    expandFileTreePaths(ancestors);
  }, [selectedFilePath, rootPath, expandFileTreePaths]);

  const { data: children } = useQuery({
    queryKey: ["dirChildren", rootPath],
    queryFn: () => listDirChildren(rootPath),
  });
  const { data: files } = useQuery({
    queryKey: ["markdownFiles", rootPath, false],
    queryFn: () => listMarkdownFiles(rootPath, false, false),
  });

  // Dropping onto the tree's own background moves an entry back up to the
  // workspace root — otherwise the only way out of a subfolder would be the
  // root's row over in the Workspaces column, which can be hidden entirely.
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${rootPath}`,
    data: { kind: "folder", path: rootPath },
  });

  const subfolders: DirEntryLite[] = useMemo(() => byName(children), [children]);
  const sortedFiles: MarkdownFileEntry[] = useMemo(() => byName(files), [files]);

  const menuItems: ContextMenuEntry[] = [
    { label: "New File", onSelect: () => rootOps.createFile(rootPath) },
    { label: "New Folder", onSelect: () => rootOps.createFolder(rootPath) },
    "separator",
    { label: "Reveal in Finder", onSelect: () => revealInFinder(rootPath) },
  ];

  // Only an answer once both listings have actually resolved — otherwise the
  // first paint of every folder would flash an "empty" message.
  const isEmpty = children !== undefined && files !== undefined && subfolders.length === 0 && sortedFiles.length === 0;

  return (
    <ContextMenu items={menuItems}>
      <div ref={setNodeRef} className={styles.tree} data-tree-root="" data-drop-target={isOver}>
        {subfolders.map((f) => (
          <TreeFolderRow key={f.path} path={f.path} name={f.name} depth={0} />
        ))}
        {sortedFiles.map((file) => (
          <TreeFileRow key={file.path} file={file} depth={0} />
        ))}
        {isEmpty && <div className={styles.empty}>This folder is empty.</div>}
      </div>
    </ContextMenu>
  );
}

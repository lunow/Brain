import { create } from "zustand";

/* The folder and file open when the app last closed, so a restart lands on
   the same page. localStorage like the panel layout: per machine. */
const LAST_OPENED_STORAGE_KEY = "write:lastOpened";

interface LastOpened {
  folder: string | null;
  file: string | null;
}

function loadLastOpened(): LastOpened {
  try {
    const raw = localStorage.getItem(LAST_OPENED_STORAGE_KEY);
    if (!raw) return { folder: null, file: null };
    const parsed = JSON.parse(raw) as Partial<LastOpened>;
    return {
      folder: typeof parsed.folder === "string" ? parsed.folder : null,
      file: typeof parsed.file === "string" ? parsed.file : null,
    };
  } catch {
    return { folder: null, file: null };
  }
}

function saveLastOpened(lastOpened: LastOpened) {
  try {
    localStorage.setItem(LAST_OPENED_STORAGE_KEY, JSON.stringify(lastOpened));
  } catch {
    // Storage unavailable — the app just starts with nothing open.
  }
}

const lastOpened = loadLastOpened();

interface WorkspaceState {
  /** Expand state for the folder/file tree in the Content column. */
  expandedFileTreePaths: Set<string>;
  toggleFileTreeExpanded: (path: string) => void;
  expandFileTreePath: (path: string) => void;
  /** Opens several folders at once. Revealing a file means opening every
   *  ancestor between the workspace root and it — as one update, so the
   *  tree doesn't re-render once per level on the way down. */
  expandFileTreePaths: (paths: string[]) => void;
  collapseFileTreePath: (path: string) => void;

  selectedFolderPath: string | null;
  selectFolder: (path: string | null) => void;

  selectedFilePath: string | null;
  selectFile: (path: string | null) => void;

  renamingPath: string | null;
  startRename: (path: string) => void;
  stopRename: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedFolderPath: lastOpened.folder,
  selectFolder: (path) => set({ selectedFolderPath: path, selectedFilePath: null }),

  selectedFilePath: lastOpened.file,
  selectFile: (path) => set({ selectedFilePath: path }),

  expandedFileTreePaths: new Set(),
  toggleFileTreeExpanded: (path) =>
    set((state) => {
      const next = new Set(state.expandedFileTreePaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedFileTreePaths: next };
    }),
  expandFileTreePath: (path) =>
    set((state) =>
      state.expandedFileTreePaths.has(path)
        ? state
        : { expandedFileTreePaths: new Set(state.expandedFileTreePaths).add(path) },
    ),
  expandFileTreePaths: (paths) =>
    set((state) => {
      if (paths.every((p) => state.expandedFileTreePaths.has(p))) return state;
      const next = new Set(state.expandedFileTreePaths);
      for (const p of paths) next.add(p);
      return { expandedFileTreePaths: next };
    }),
  collapseFileTreePath: (path) =>
    set((state) => {
      if (!state.expandedFileTreePaths.has(path)) return state;
      const next = new Set(state.expandedFileTreePaths);
      next.delete(path);
      return { expandedFileTreePaths: next };
    }),

  renamingPath: null,
  startRename: (path) => set({ renamingPath: path }),
  stopRename: () => set({ renamingPath: null }),
}));

useWorkspaceStore.subscribe((state, prev) => {
  if (state.selectedFolderPath === prev.selectedFolderPath && state.selectedFilePath === prev.selectedFilePath) return;
  saveLastOpened({ folder: state.selectedFolderPath, file: state.selectedFilePath });
});

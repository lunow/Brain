import { create } from "zustand";

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
  selectedFolderPath: null,
  selectFolder: (path) => set({ selectedFolderPath: path, selectedFilePath: null }),

  selectedFilePath: null,
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

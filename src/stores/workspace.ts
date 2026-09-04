import { create } from "zustand";

interface WorkspaceState {
  /** Expand state for the folder/file tree shown in the middle column when
   *  "Subfolders" is on. */
  expandedFileTreePaths: Set<string>;
  toggleFileTreeExpanded: (path: string) => void;

  selectedFolderPath: string | null;
  selectFolder: (path: string | null) => void;

  selectedFilePath: string | null;
  selectFile: (path: string | null) => void;

  includeSubfolders: boolean;
  toggleIncludeSubfolders: () => void;

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

  includeSubfolders: true,
  toggleIncludeSubfolders: () => set((state) => ({ includeSubfolders: !state.includeSubfolders })),

  renamingPath: null,
  startRename: (path) => set({ renamingPath: path }),
  stopRename: () => set({ renamingPath: null }),
}));

import { create } from "zustand";
import type { EditorView } from "@codemirror/view";

export type WidthPreset = "narrow" | "normal" | "full";
export type WritingMode = "ideate" | "write" | "review";

const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.6;
const FONT_SCALE_STEP = 0.1;

export const TREE_WIDTH_MIN = 180;
export const TREE_WIDTH_MAX = 480;
export const FILE_LIST_WIDTH_MIN = 180;
export const FILE_LIST_WIDTH_MAX = 480;
export const RIGHT_SIDEBAR_WIDTH_MIN = 240;
export const RIGHT_SIDEBAR_WIDTH_MAX = 560;

const PANEL_WIDTHS_STORAGE_KEY = "write:panelWidths";

interface PanelWidths {
  tree: number;
  fileList: number;
  rightSidebar: number;
}

const DEFAULT_PANEL_WIDTHS: PanelWidths = { tree: 260, fileList: 260, rightSidebar: 320 };

function loadPanelWidths(): PanelWidths {
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY);
    if (!raw) return DEFAULT_PANEL_WIDTHS;
    return { ...DEFAULT_PANEL_WIDTHS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PANEL_WIDTHS;
  }
}

function savePanelWidths(widths: PanelWidths) {
  try {
    localStorage.setItem(PANEL_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Storage unavailable (e.g. private mode) — widths just won't persist.
  }
}

const PANEL_VISIBILITY_STORAGE_KEY = "write:panelVisibility";

interface PanelVisibility {
  tree: boolean;
  fileList: boolean;
  rightSidebar: boolean;
}

const DEFAULT_PANEL_VISIBILITY: PanelVisibility = { tree: true, fileList: true, rightSidebar: true };

function loadPanelVisibility(): PanelVisibility {
  try {
    const raw = localStorage.getItem(PANEL_VISIBILITY_STORAGE_KEY);
    if (!raw) return DEFAULT_PANEL_VISIBILITY;
    return { ...DEFAULT_PANEL_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PANEL_VISIBILITY;
  }
}

function savePanelVisibility(visibility: PanelVisibility) {
  try {
    localStorage.setItem(PANEL_VISIBILITY_STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // Storage unavailable (e.g. private mode) — visibility just won't persist.
  }
}

interface UiState {
  widthPreset: WidthPreset;
  setWidthPreset: (preset: WidthPreset) => void;

  /** Ideate/Write/Review — drives what (if anything) shows in the right
   *  sidebar. Not persisted: always starts back on "write". */
  writingMode: WritingMode;
  setWritingMode: (mode: WritingMode) => void;

  /** OpenRouter API key / model settings modal, opened from the Ideate and
   *  Review sidebars. */
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  /** App-level text-size setting (Cmd+Plus/Minus/0), distinct from WKWebView's
   *  own pinch/Cmd zoom — drives --app-font-scale, which every rem value in
   *  the app scales from. */
  fontScale: number;
  incrementFontScale: () => void;
  decrementFontScale: () => void;
  resetFontScale: () => void;

  /** Cmd+K jump-to-anything palette (folders, files, and commands). */
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  /** The currently mounted MarkdownEditor's CodeMirror view, if any —
   *  registered by FileEditor. Ideate and Review read the LIVE document
   *  through this rather than the React Query file-content cache: that
   *  cache is only refreshed on file load/external change, not as the
   *  user types, so it goes stale the moment there's an unsaved edit
   *  (autosave doesn't invalidate it either) — grounding an OpenRouter
   *  request or locating a suggestion's quote against it would silently
   *  drift from the real document. */
  activeEditorView: EditorView | null;
  setActiveEditorView: (view: EditorView | null) => void;

  /** Drag-to-resize widths for the tree, file list, and right sidebar
   *  columns. Persisted to localStorage so layout choices survive restarts. */
  treeWidth: number;
  setTreeWidth: (width: number) => void;
  fileListWidth: number;
  setFileListWidth: (width: number) => void;
  rightSidebarWidth: number;
  setRightSidebarWidth: (width: number) => void;

  /** Show/hide the tree, file list, and right sidebar columns entirely
   *  (distinct from their widths above). Persisted to localStorage. */
  treeVisible: boolean;
  toggleTreeVisible: () => void;
  fileListVisible: boolean;
  toggleFileListVisible: () => void;
  rightSidebarVisible: boolean;
  toggleRightSidebarVisible: () => void;

  /** Distraction-free view: hides the tree/file-list/right-sidebar columns
   *  and (in Narrow/Width) centers the page instead of sitting flush-left.
   *  Not persisted — always starts back off, like writingMode. */
  fullscreenActive: boolean;
  toggleFullscreen: () => void;
  exitFullscreen: () => void;
}

const initialPanelWidths = loadPanelWidths();
const initialPanelVisibility = loadPanelVisibility();

export const useUiStore = create<UiState>((set, get) => ({
  widthPreset: "normal",
  setWidthPreset: (preset) => set({ widthPreset: preset }),

  writingMode: "write",
  setWritingMode: (mode) => set({ writingMode: mode }),

  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  fontScale: 1,
  incrementFontScale: () =>
    set((state) => ({ fontScale: Math.min(FONT_SCALE_MAX, roundScale(state.fontScale + FONT_SCALE_STEP)) })),
  decrementFontScale: () =>
    set((state) => ({ fontScale: Math.max(FONT_SCALE_MIN, roundScale(state.fontScale - FONT_SCALE_STEP)) })),
  resetFontScale: () => set({ fontScale: 1 }),

  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  activeEditorView: null,
  setActiveEditorView: (view) => set({ activeEditorView: view }),

  treeWidth: initialPanelWidths.tree,
  setTreeWidth: (width) => {
    set({ treeWidth: width });
    const { treeWidth, fileListWidth, rightSidebarWidth } = get();
    savePanelWidths({ tree: treeWidth, fileList: fileListWidth, rightSidebar: rightSidebarWidth });
  },
  fileListWidth: initialPanelWidths.fileList,
  setFileListWidth: (width) => {
    set({ fileListWidth: width });
    const { treeWidth, fileListWidth, rightSidebarWidth } = get();
    savePanelWidths({ tree: treeWidth, fileList: fileListWidth, rightSidebar: rightSidebarWidth });
  },
  rightSidebarWidth: initialPanelWidths.rightSidebar,
  setRightSidebarWidth: (width) => {
    set({ rightSidebarWidth: width });
    const { treeWidth, fileListWidth, rightSidebarWidth } = get();
    savePanelWidths({ tree: treeWidth, fileList: fileListWidth, rightSidebar: rightSidebarWidth });
  },

  treeVisible: initialPanelVisibility.tree,
  toggleTreeVisible: () => {
    set((state) => ({ treeVisible: !state.treeVisible }));
    const { treeVisible, fileListVisible, rightSidebarVisible } = get();
    savePanelVisibility({ tree: treeVisible, fileList: fileListVisible, rightSidebar: rightSidebarVisible });
  },
  fileListVisible: initialPanelVisibility.fileList,
  toggleFileListVisible: () => {
    set((state) => ({ fileListVisible: !state.fileListVisible }));
    const { treeVisible, fileListVisible, rightSidebarVisible } = get();
    savePanelVisibility({ tree: treeVisible, fileList: fileListVisible, rightSidebar: rightSidebarVisible });
  },
  rightSidebarVisible: initialPanelVisibility.rightSidebar,
  toggleRightSidebarVisible: () => {
    set((state) => ({ rightSidebarVisible: !state.rightSidebarVisible }));
    const { treeVisible, fileListVisible, rightSidebarVisible } = get();
    savePanelVisibility({ tree: treeVisible, fileList: fileListVisible, rightSidebar: rightSidebarVisible });
  },

  fullscreenActive: false,
  toggleFullscreen: () => set((state) => ({ fullscreenActive: !state.fullscreenActive })),
  exitFullscreen: () => set({ fullscreenActive: false }),
}));

function roundScale(n: number): number {
  return Math.round(n * 100) / 100;
}

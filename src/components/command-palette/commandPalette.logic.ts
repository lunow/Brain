import type { ExportKind } from "@/components/editor/ExportMenu";
import type { WidthPreset, WritingMode } from "@/stores/ui";

export interface FolderResult {
  type: "folder";
  name: string;
  path: string;
  rootPath: string;
}

export interface FileResult {
  type: "file";
  name: string;
  path: string;
  rootPath: string;
}

export interface CommandResult {
  type: "command";
  id: string;
  section: string;
  label: string;
  hint?: string;
  run: () => void;
}

export type PaletteResult = CommandResult | FolderResult | FileResult;

export interface ResultGroup {
  label: string;
  items: PaletteResult[];
}

export interface NavIndex {
  folders: FolderResult[];
  files: FileResult[];
}

/** Parent directory of a path, POSIX-style (this app only targets macOS). */
export function parentDirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Case-insensitive match score: 0 = name starts with query, 1 = name
 *  contains it, 2 = only the path contains it, null = no match. Lower is
 *  a better match. An empty query matches everything at score 0. */
function scoreEntry(query: string, name: string, path: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(q)) return 1;
  if (path.toLowerCase().includes(q)) return 2;
  return null;
}

function scoreLabel(query: string, label: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(q)) return 1;
  return null;
}

export const MAX_NAV_RESULTS = 50;
export const COMMAND_SECTIONS = ["Create", "Mode", "View", "Export"] as const;

export interface CommandContext {
  treeVisible: boolean;
  fileListVisible: boolean;
  rightSidebarVisible: boolean;
  /** Already bound to the current selected folder (a no-op if none). */
  createFile: () => void;
  /** Already bound to the current selected folder (a no-op if none). */
  createFolder: () => void;
  addRoot: () => void;
  setWritingMode: (mode: WritingMode) => void;
  toggleTreeVisible: () => void;
  toggleFileListVisible: () => void;
  toggleRightSidebarVisible: () => void;
  setWidthPreset: (preset: WidthPreset) => void;
  /** Already bound to the current selected file. */
  requestExport: (kind: ExportKind) => void;
}

/**
 * The palette's flat, easy-to-extend command list. Visibility given the
 * current app state (e.g. no folder selected) and search ranking are
 * applied separately in `buildResultGroups` — this is just the declarative
 * set, with labels reflecting current toggle state (Hide vs Show).
 */
export function buildCommands(ctx: CommandContext): CommandResult[] {
  return [
    { type: "command", id: "new-file", section: "Create", label: "New File", hint: "⌘N", run: ctx.createFile },
    { type: "command", id: "new-folder", section: "Create", label: "New Folder", hint: "⇧⌘N", run: ctx.createFolder },
    { type: "command", id: "add-root", section: "Create", label: "Add Folder to Workspace…", hint: "⌘O", run: ctx.addRoot },
    { type: "command", id: "mode-ideate", section: "Mode", label: "Ideate Mode", hint: "⌘1", run: () => ctx.setWritingMode("ideate") },
    { type: "command", id: "mode-write", section: "Mode", label: "Write Mode", hint: "⌘2", run: () => ctx.setWritingMode("write") },
    { type: "command", id: "mode-review", section: "Mode", label: "Review Mode", hint: "⌘3", run: () => ctx.setWritingMode("review") },
    {
      type: "command",
      id: "toggle-folders",
      section: "View",
      label: ctx.treeVisible ? "Hide Workspaces" : "Show Workspaces",
      hint: "⌘D",
      run: ctx.toggleTreeVisible,
    },
    {
      type: "command",
      id: "toggle-files",
      section: "View",
      label: ctx.fileListVisible ? "Hide Content" : "Show Content",
      hint: "⇧⌘D",
      run: ctx.toggleFileListVisible,
    },
    {
      type: "command",
      id: "toggle-sidebar",
      section: "View",
      label: ctx.rightSidebarVisible ? "Hide Sidebar" : "Show Sidebar",
      hint: "⌘J",
      run: ctx.toggleRightSidebarVisible,
    },
    { type: "command", id: "width-narrow", section: "View", label: "Narrow Width", hint: "⇧⌘1", run: () => ctx.setWidthPreset("narrow") },
    { type: "command", id: "width-normal", section: "View", label: "Normal Width", hint: "⇧⌘2", run: () => ctx.setWidthPreset("normal") },
    { type: "command", id: "width-full", section: "View", label: "Full Width", hint: "⇧⌘3", run: () => ctx.setWidthPreset("full") },
    { type: "command", id: "export-pdf", section: "Export", label: "Export as PDF", run: () => ctx.requestExport("pdf") },
    { type: "command", id: "export-word", section: "Export", label: "Export as Word", run: () => ctx.requestExport("word") },
    { type: "command", id: "export-publish", section: "Export", label: "Publish", run: () => ctx.requestExport("publish") },
  ];
}

export interface BuildResultGroupsParams {
  query: string;
  commands: CommandResult[];
  navIndex: NavIndex | undefined;
  selectedFolderPath: string | null;
  selectedFilePath: string | null;
  writingMode: WritingMode;
  treeVisible: boolean;
  fileListVisible: boolean;
}

function commandSectionGroups(params: BuildResultGroupsParams, trimmed: string): ResultGroup[] {
  const { commands, selectedFolderPath, selectedFilePath, writingMode } = params;
  const result: ResultGroup[] = [];
  for (const section of COMMAND_SECTIONS) {
    const items = commands
      .filter((c) => c.section === section)
      .filter((c) => !((c.id === "new-file" || c.id === "new-folder") && !selectedFolderPath))
      .filter((c) => !(c.section === "Export" && !selectedFilePath))
      .filter((c) => !(c.id === "toggle-sidebar" && writingMode === "write"))
      .map((c) => ({ c, score: scoreLabel(trimmed, c.label) }))
      .filter((x): x is { c: CommandResult; score: number } => x.score !== null)
      .sort((a, b) => a.score - b.score);
    if (items.length) result.push({ label: section, items: items.map((x) => x.c) });
  }
  return result;
}

function rankedNavResults<T extends FolderResult | FileResult>(entries: T[], trimmed: string): T[] {
  return entries
    .map((e) => ({ e, score: scoreEntry(trimmed, e.name, e.path) }))
    .filter((x): x is { e: T; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name))
    .slice(0, MAX_NAV_RESULTS)
    .map((x) => x.e);
}

/**
 * Builds the sectioned, search-ranked result list shown in the palette:
 * matching commands (filtered by what's applicable given the current
 * selection/mode), then matching folders/files, or — with an empty query —
 * just the workspace roots. Pure and React-free so the ranking logic can be
 * unit-tested without mounting the component.
 */
export function buildResultGroups(params: BuildResultGroupsParams): ResultGroup[] {
  const { navIndex, treeVisible, fileListVisible } = params;
  const trimmed = params.query.trim();
  const result = commandSectionGroups(params, trimmed);

  if (trimmed) {
    if (treeVisible) {
      const folders = rankedNavResults(navIndex?.folders ?? [], trimmed);
      if (folders.length) result.push({ label: "Folders", items: folders });
    }
    if (fileListVisible) {
      const files = rankedNavResults(navIndex?.files ?? [], trimmed);
      if (files.length) result.push({ label: "Files", items: files });
    }
  } else if (treeVisible) {
    const rootFolders = (navIndex?.folders ?? []).filter((f) => f.path === f.rootPath);
    if (rootFolders.length) result.push({ label: "Folders", items: rootFolders });
  }

  return result;
}

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export interface DirEntryLite {
  name: string;
  path: string;
  isDir: boolean;
}

export interface RootFolder {
  id: string;
  path: string;
  displayName: string;
  addedAt: number;
}

export interface MarkdownFileEntry {
  name: string;
  path: string;
  modifiedAt: number;
  size: number;
  preview: string;
}

export function listDirChildren(path: string): Promise<DirEntryLite[]> {
  return invoke("list_dir_children", { path });
}

/** Recursively lists every subfolder under `path`, at any depth — powers
 *  the Cmd+K command palette's folder search. */
export function listAllFolders(path: string): Promise<DirEntryLite[]> {
  return invoke("list_all_folders", { path });
}

export interface FolderStats {
  folderCount: number;
  fileCount: number;
  lastModifiedAt: number | null;
}

/** Recursive folder/file counts and most recent modification time under
 *  `path` — powers the left sidebar's per-workspace summary line. */
export function getFolderStats(path: string): Promise<FolderStats> {
  return invoke("get_folder_stats", { path });
}

export function readFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}

export function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

export function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  return invoke("write_binary_file", { path, data: Array.from(data) });
}

/** Opens the native save-file picker pre-filled with `defaultPath`;
 *  resolves to null if the user cancels. */
export async function pickSaveLocation(defaultPath: string, extension: string, typeLabel: string): Promise<string | null> {
  const selected = await save({
    defaultPath,
    filters: [{ name: typeLabel, extensions: [extension] }],
  });
  return selected ?? null;
}

/** `includePreview` defaults to true for the middle-column file list, which
 *  shows a content snippet per file; pass false to skip reading every
 *  file's content (e.g. the Cmd+K palette, which only needs name/path but
 *  recurses across every workspace root). */
export function listMarkdownFiles(folderPath: string, recursive: boolean, includePreview = true): Promise<MarkdownFileEntry[]> {
  return invoke("list_markdown_files", { folderPath, recursive, includePreview });
}

export function getWorkspaceRoots(): Promise<RootFolder[]> {
  return invoke("get_workspace_roots");
}

export function addRootFolder(path: string): Promise<RootFolder> {
  return invoke("add_root_folder", { path });
}

export function removeRootFolder(id: string): Promise<void> {
  return invoke("remove_root_folder", { id });
}

/** Opens the native folder picker; resolves to null if the user cancels. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return (selected as string | null) ?? null;
}

export interface EntryMeta {
  name: string;
  path: string;
}

export function createFile(parentDir: string, name: string): Promise<EntryMeta> {
  return invoke("create_file", { parentDir, name });
}

export function createFolder(parentDir: string, name: string): Promise<EntryMeta> {
  return invoke("create_folder", { parentDir, name });
}

export function renameEntry(path: string, newName: string): Promise<string> {
  return invoke("rename_entry", { path, newName });
}

export function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

export function moveEntry(srcPath: string, destDir: string): Promise<string> {
  return invoke("move_entry", { srcPath, destDir });
}

export function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export function duplicateEntry(path: string): Promise<EntryMeta> {
  return invoke("duplicate_entry", { path });
}

export interface AppSettings {
  openrouterApiKey: string | null;
  defaultModel: string;
}

export function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export function setSettings(settings: AppSettings): Promise<void> {
  return invoke("set_settings", { settings });
}

/** The folder passed on the command line at first launch (`brain <folder>`),
 *  if any — consumed once. A second `brain <folder>` while the app is
 *  already running arrives instead as a live "cli://open-folder" event,
 *  handled by useCliOpenFolder. */
export function getLaunchFolder(): Promise<string | null> {
  return invoke("get_launch_folder");
}

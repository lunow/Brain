import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { Connect, Plugin } from "vite";

/**
 * Dev-only Vite middleware that mirrors the Tauri Rust commands (src-tauri/
 * src/commands/) against the real filesystem. Lets the frontend be opened
 * directly in a browser tab (bypassing the native Tauri webview) for
 * interaction testing with standard browser automation tooling, while still
 * exercising real command behavior. See src/lib/tauri-dev-bridge.ts for the
 * client side. Keep each case in sync with its Rust counterpart when adding
 * commands.
 */
export function tauriDevApiPlugin(): Plugin {
  return {
    name: "tauri-dev-api",
    configureServer(server) {
      server.middlewares.use("/__dev_api/invoke", (req, res) => {
        handleRequest(req, res).catch((err) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        });
      });
    },
  };
}

async function handleRequest(req: Connect.IncomingMessage, res: import("node:http").ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const { cmd, args } = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");

  const result = await handleCommand(cmd, args ?? {});
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, result }));
}

// --- dev-only workspace persistence (mirrors tauri-plugin-store's app-data-dir JSON blob) ---

const devStorePath = path.join(process.cwd(), "node_modules", ".cache", "dev-workspace.json");
const devSettingsPath = path.join(process.cwd(), "node_modules", ".cache", "dev-settings.json");

// --- settings (mirrors src-tauri/src/commands/settings.rs) ---

interface AppSettings {
  openrouterApiKey: string | null;
  defaultModel: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: null,
  defaultModel: "anthropic/claude-sonnet-4.5",
};

async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(devSettingsPath, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(devSettingsPath), { recursive: true });
  await fs.writeFile(devSettingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

// --- CRUD (mirrors src-tauri/src/commands/crud.rs) ---

function dedupeName(dir: string, baseStem: string, extension: string | null): string {
  const makeName = (n: number) => {
    if (extension) return n === 1 ? `${baseStem}.${extension}` : `${baseStem} ${n}.${extension}`;
    return n === 1 ? baseStem : `${baseStem} ${n}`;
  };
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = makeName(n);
    if (!existsSync(path.join(dir, candidate))) return candidate;
    n += 1;
  }
}

function splitStemExt(name: string): [string, string | null] {
  const idx = name.lastIndexOf(".");
  if (idx > 0) return [name.slice(0, idx), name.slice(idx + 1)];
  return [name, null];
}

interface RootFolder {
  id: string;
  path: string;
  displayName: string;
  addedAt: number;
}

async function readRoots(): Promise<RootFolder[]> {
  try {
    const raw = await fs.readFile(devStorePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeRoots(roots: RootFolder[]): Promise<void> {
  await fs.mkdir(path.dirname(devStorePath), { recursive: true });
  await fs.writeFile(devStorePath, JSON.stringify(roots, null, 2), "utf-8");
}

// --- markdown file listing (mirrors src-tauri/src/commands/files.rs) ---

function buildPreview(content: string): string {
  let body = content;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end !== -1) body = body.slice(end + 4);
  }

  const text = body
    .split("\n")
    .map((line) => line.trim().replace(/^[#>\-*`\s]+/, ""))
    .filter((line) => line.length > 0)
    .join(" ");

  return text.slice(0, 150);
}

async function collectFolders(dir: string, out: unknown[]): Promise<void> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const d of dirents) {
    if (d.name.startsWith(".") || !d.isDirectory()) continue;
    const fullPath = path.join(dir, d.name);
    out.push({ name: d.name, path: fullPath, isDir: true });
    await collectFolders(fullPath, out);
  }
}

interface FolderStats {
  folderCount: number;
  fileCount: number;
  lastModifiedAt: number | null;
}

async function collectStats(dir: string, stats: FolderStats): Promise<void> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    const fullPath = path.join(dir, d.name);
    if (d.isDirectory()) {
      stats.folderCount += 1;
      await collectStats(fullPath, stats);
      continue;
    }
    stats.fileCount += 1;
    const stat = await fs.stat(fullPath);
    if (stats.lastModifiedAt === null || stat.mtimeMs > stats.lastModifiedAt) {
      stats.lastModifiedAt = stat.mtimeMs;
    }
  }
}

async function collectMarkdownFiles(dir: string, recursive: boolean, out: unknown[]): Promise<void> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    const fullPath = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (recursive) await collectMarkdownFiles(fullPath, recursive, out);
      continue;
    }
    if (!d.name.toLowerCase().endsWith(".md")) continue;

    const stat = await fs.stat(fullPath);
    const content = await fs.readFile(fullPath, "utf-8").catch(() => "");
    out.push({
      name: d.name,
      path: fullPath,
      modifiedAt: stat.mtimeMs,
      size: stat.size,
      preview: buildPreview(content),
    });
  }
}

async function handleCommand(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    // Only the Home directory variant is ever requested by the frontend
    // (@tauri-apps/api/path's homeDir()), so the BaseDirectory arg is
    // ignored rather than fully emulating the resolve_directory command.
    case "plugin:path|resolve_directory": {
      return os.homedir();
    }
    // `brain <folder>` CLI launches only exist as real OS processes — no
    // dev-browser equivalent, so just report "nothing pending" rather than
    // emulating the single-instance plugin here.
    case "get_launch_folder": {
      return null;
    }
    case "list_dir_children": {
      const dirPath = args.path as string;
      const dirents = await fs.readdir(dirPath, { withFileTypes: true });
      return dirents
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => ({ name: d.name, path: path.join(dirPath, d.name), isDir: true }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    }
    case "list_all_folders": {
      const out: unknown[] = [];
      await collectFolders(args.path as string, out);
      out.sort((a: any, b: any) => (a.path as string).toLowerCase().localeCompare((b.path as string).toLowerCase()));
      return out;
    }
    case "get_folder_stats": {
      const stats: FolderStats = { folderCount: 0, fileCount: 0, lastModifiedAt: null };
      await collectStats(args.path as string, stats);
      return stats;
    }
    case "read_file": {
      return await fs.readFile(args.path as string, "utf-8");
    }
    case "write_file": {
      await fs.writeFile(args.path as string, args.content as string, "utf-8");
      return null;
    }
    case "list_markdown_files": {
      const out: unknown[] = [];
      await collectMarkdownFiles(args.folderPath as string, Boolean(args.recursive), out);
      out.sort((a: any, b: any) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return out;
    }
    case "get_workspace_roots": {
      return await readRoots();
    }
    case "add_root_folder": {
      const roots = await readRoots();
      const targetPath = args.path as string;
      const existing = roots.find((r) => r.path === targetPath);
      if (existing) return existing;
      const root: RootFolder = {
        id: Math.random().toString(16).slice(2),
        path: targetPath,
        displayName: path.basename(targetPath) || targetPath,
        addedAt: Date.now(),
      };
      roots.push(root);
      await writeRoots(roots);
      return root;
    }
    case "remove_root_folder": {
      const roots = await readRoots();
      const next = roots.filter((r) => r.id !== args.id);
      await writeRoots(next);
      return null;
    }
    case "create_file": {
      const dir = args.parentDir as string;
      const raw = args.name as string;
      const stem = raw.endsWith(".md") ? raw.slice(0, -3) : raw;
      const finalName = dedupeName(dir, stem, "md");
      const filePath = path.join(dir, finalName);
      await fs.writeFile(filePath, "", "utf-8");
      return { name: finalName, path: filePath };
    }
    case "create_folder": {
      const dir = args.parentDir as string;
      const finalName = dedupeName(dir, args.name as string, null);
      const folderPath = path.join(dir, finalName);
      await fs.mkdir(folderPath);
      return { name: finalName, path: folderPath };
    }
    case "rename_entry": {
      const src = args.path as string;
      const dest = path.join(path.dirname(src), args.newName as string);
      await fs.rename(src, dest);
      return dest;
    }
    case "delete_entry": {
      // Dev-only: no Trash API from Node, just remove directly (test fixtures only).
      await fs.rm(args.path as string, { recursive: true, force: true });
      return null;
    }
    case "move_entry": {
      const src = args.srcPath as string;
      const dir = args.destDir as string;
      const name = path.basename(src);
      if (path.dirname(src) === dir) return src;
      const [stem, ext] = splitStemExt(name);
      const finalName = dedupeName(dir, stem, ext);
      const dest = path.join(dir, finalName);
      await fs.rename(src, dest);
      return dest;
    }
    case "reveal_in_finder": {
      execFile("open", ["-R", args.path as string]);
      return null;
    }
    case "get_settings": {
      return await readSettings();
    }
    case "set_settings": {
      await writeSettings(args.settings as AppSettings);
      return null;
    }
    case "duplicate_entry": {
      const src = args.path as string;
      const dir = path.dirname(src);
      const [stem, ext] = splitStemExt(path.basename(src));
      const finalName = dedupeName(dir, `${stem} copy`, ext);
      const dest = path.join(dir, finalName);
      await fs.copyFile(src, dest);
      return { name: finalName, path: dest };
    }
    default:
      throw new Error(`Unhandled dev-mocked command: ${cmd}`);
  }
}

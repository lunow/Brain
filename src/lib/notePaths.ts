import type { RootFolder } from "./tauri-commands";

/**
 * Resolution of the link targets written inside notes. Both the editor's
 * ⌘-click handler (`mdLink.ts`) and the note graph read link hrefs the same
 * way, so the rules live here once: a link that opens a given file on
 * ⌘-click is exactly the link that draws an edge to it in the graph.
 */

// Anything with a "scheme:" prefix (http:, https:, mailto:, ...) is treated
// as external and handed to the OS; everything else is a local file
// reference to resolve and open in-app.
export const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

/** POSIX-style path join with `.`/`..` resolution (this app only targets
 *  macOS, same assumption `TreeSidebar.parentDirOf` makes). */
export function joinPosix(base: string, relative: string): string {
  const stack: string[] = [];
  for (const part of `${base}/${relative}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

/** The workspace root an absolute path belongs to, or undefined if it sits
 *  outside every open root. */
export function rootContaining(path: string, roots: RootFolder[]): RootFolder | undefined {
  return roots.find((r) => path === r.path || path.startsWith(r.path + "/"));
}

/**
 * Absolute path a link href points at, or null when it isn't a local file
 * reference at all (an external URL, or a root-relative link written in a
 * file that lives outside every open workspace root).
 *
 * Any `#fragment` is dropped: a link to a heading within a note still refers
 * to that note.
 */
export function resolveLocalLink(href: string, currentFilePath: string, roots: RootFolder[]): string | null {
  if (SCHEME_PATTERN.test(href)) return null;

  const [targetPath] = href.split("#");
  // A bare "#heading" link is a self-reference, not a link to another note.
  if (!targetPath) return null;

  if (targetPath.startsWith("/")) {
    // Root-relative: resolve against whichever open workspace root contains
    // the file the link was written in.
    const root = rootContaining(currentFilePath, roots);
    if (!root) return null;
    return root.path + targetPath;
  }

  return joinPosix(dirnameOf(currentFilePath), targetPath);
}

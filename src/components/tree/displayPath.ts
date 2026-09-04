/** Shortens a path under the user's home directory to a `~/...` form. */
export function displayPath(path: string, homeDir?: string): string {
  if (homeDir && (path === homeDir || path.startsWith(homeDir + "/"))) {
    return "~" + path.slice(homeDir.length);
  }
  return path;
}

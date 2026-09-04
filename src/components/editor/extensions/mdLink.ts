import { EditorView } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getWorkspaceRoots } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";

// Anything with a "scheme:" prefix (http:, https:, mailto:, ...) is treated
// as external and handed to the OS; everything else is a local file
// reference to resolve and open in-app.
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

/** POSIX-style path join with `.`/`..` resolution (this app only targets
 *  macOS, same assumption `TreeSidebar.parentDirOf` makes). */
function joinPosix(base: string, relative: string): string {
  const stack: string[] = [];
  for (const part of `${base}/${relative}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

async function openLocalLink(targetPath: string, currentFilePath: string) {
  if (targetPath.startsWith("/")) {
    // Root-relative: resolve against whichever open workspace root contains
    // the file the link was written in.
    const roots = await getWorkspaceRoots();
    const root = roots.find((r) => currentFilePath === r.path || currentFilePath.startsWith(r.path + "/"));
    if (!root) return;
    useWorkspaceStore.getState().selectFile(root.path + targetPath);
    return;
  }
  useWorkspaceStore.getState().selectFile(joinPosix(dirnameOf(currentFilePath), targetPath));
}

/**
 * Cmd/Ctrl-click on a rendered markdown link (`cm-mkLink`, see livePreview.ts)
 * opens it: external URLs go to the system browser/mail client via the
 * `opener` plugin, local file references navigate to that file in-app.
 */
export function mdLinkClickHandler(getCurrentFilePath: () => string | null) {
  return EditorView.domEventHandlers({
    mousedown(event) {
      if (!(event.metaKey || event.ctrlKey)) return false;
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.("[data-href]") as HTMLElement | null;
      if (!el) return false;
      const href = el.getAttribute("data-href");
      if (!href) return false;
      event.preventDefault();

      if (SCHEME_PATTERN.test(href)) {
        openUrl(href);
        return true;
      }

      const currentFilePath = getCurrentFilePath();
      const [targetPath] = href.split("#");
      if (targetPath && currentFilePath) {
        openLocalLink(targetPath, currentFilePath);
      }
      return true;
    },
  });
}

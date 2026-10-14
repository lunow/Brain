import { EditorView } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getWorkspaceRoots } from "@/lib/tauri-commands";
import { SCHEME_PATTERN, resolveLocalLink } from "@/lib/notePaths";
import { useWorkspaceStore } from "@/stores/workspace";

async function openLocalLink(href: string, currentFilePath: string) {
  const roots = await getWorkspaceRoots();
  const target = resolveLocalLink(href, currentFilePath, roots);
  if (target) useWorkspaceStore.getState().selectFile(target);
}

/**
 * Cmd/Ctrl-click on a rendered markdown link (`cm-mkLink`, see livePreview.ts)
 * opens it: external URLs go to the system browser/mail client via the
 * `opener` plugin, local file references navigate to that file in-app
 * (resolved by `notePaths.resolveLocalLink`, the same rules the note graph
 * draws its edges from).
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
      if (currentFilePath) openLocalLink(href, currentFilePath);
      return true;
    },
  });
}

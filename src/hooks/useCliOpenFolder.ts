import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { addRootFolder, getLaunchFolder } from "@/lib/tauri-commands";
import { useWorkspaceStore } from "@/stores/workspace";

/** Handles `brain <folder>` typed in a terminal: adds the folder as a
 *  workspace root — a no-op if it's already one, since `add_root_folder` is
 *  idempotent (returns the existing root rather than duplicating it) — and
 *  selects it, same as clicking it in the Workspaces column.
 *
 *  Two delivery paths from the Rust side: a fresh launch carries the folder
 *  as a CLI arg, fetched once here via getLaunchFolder(); a launch while the
 *  app is already running is forwarded live by the single-instance plugin
 *  (src-tauri/src/lib.rs) as a "cli://open-folder" event instead, since the
 *  app is already running and a listener already exists to catch it. */
export function useCliOpenFolder() {
  const queryClient = useQueryClient();

  useEffect(() => {
    async function openFolder(path: string) {
      await addRootFolder(path);
      await queryClient.invalidateQueries({ queryKey: ["workspaceRoots"] });
      useWorkspaceStore.getState().selectFolder(path);
    }

    getLaunchFolder().then((path) => {
      if (path) void openFolder(path);
    });

    const unlistenPromise = listen<string>("cli://open-folder", (event) => {
      void openFolder(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [queryClient]);
}

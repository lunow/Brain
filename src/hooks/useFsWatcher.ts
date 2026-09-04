import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";

export interface FsChangedPayload {
  rootId: string;
  paths: string[];
}

/**
 * Broad invalidation on any filesystem change reported by the Rust watcher
 * (src-tauri/src/watcher.rs): refreshes the tree and file-list caches
 * wherever they're mounted. Per-open-file conflict detection lives in
 * FileEditor, which needs dirty-state awareness this hook doesn't have.
 */
export function useFsWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    const unlistenPromise = listen<FsChangedPayload>("fs://changed", () => {
      if (disposed) return;
      queryClient.invalidateQueries({ queryKey: ["dirChildren"] });
      queryClient.invalidateQueries({ queryKey: ["markdownFiles"] });
    });
    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [queryClient]);
}

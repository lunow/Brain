import { useEffect, useMemo } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addRootFolder, getWorkspaceRoots, pickFolder, removeRootFolder } from "@/lib/tauri-commands";
import { WorkspaceRootItem } from "./WorkspaceRootItem";
import styles from "./TreeSidebar.module.css";

export function TreeSidebar() {
  const queryClient = useQueryClient();
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots });
  const { data: home } = useQuery({ queryKey: ["homeDir"], queryFn: homeDir, staleTime: Infinity });

  // Sorted by full path, which already clusters roots under a shared parent
  // directory next to each other. There is deliberately no group heading:
  // the folder a workspace happens to live in is the user's filesystem
  // layout, not information about the workspace.
  const sortedRoots = useMemo(
    () => (roots ? [...roots].sort((a, b) => a.path.localeCompare(b.path)) : []),
    [roots],
  );

  const addRoot = useMutation({
    mutationFn: async () => {
      const path = await pickFolder();
      if (!path) return null;
      return addRootFolder(path);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceRoots"] }),
  });

  const removeRoot = useMutation({
    mutationFn: (id: string) => removeRootFolder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceRoots"] }),
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        addRoot.mutate();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Workspaces</span>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => addRoot.mutate()}
          aria-label="Add folder"
          title="Add folder (⌘O)"
        >
          +
        </button>
      </div>

      <div className={styles.content}>
        {roots?.length === 0 && <div className={styles.empty}>No folders added yet.</div>}

        <div className={styles.list}>
          {sortedRoots.map((root) => (
            <div key={root.id} className={styles.rootItem}>
              <WorkspaceRootItem root={root} homeDir={home} onRemoveRoot={() => removeRoot.mutate(root.id)} />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeRoot.mutate(root.id)}
                aria-label={`Remove ${root.displayName}`}
                title="Remove from sidebar"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

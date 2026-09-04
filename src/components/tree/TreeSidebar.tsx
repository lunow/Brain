import { useEffect, useMemo } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addRootFolder, getWorkspaceRoots, pickFolder, removeRootFolder, type RootFolder } from "@/lib/tauri-commands";
import { displayPath } from "./displayPath";
import { WorkspaceRootItem } from "./WorkspaceRootItem";
import styles from "./TreeSidebar.module.css";

/** Parent directory of a path, POSIX-style (this app only targets macOS). */
function parentDirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

export function TreeSidebar() {
  const queryClient = useQueryClient();
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots });
  const { data: home } = useQuery({ queryKey: ["homeDir"], queryFn: homeDir, staleTime: Infinity });

  // Sorted by full path, then grouped by shared parent directory so
  // related roots cluster together; a group only gets its own subheader
  // once it's large enough (>2) to be worth the extra visual grouping.
  const groups = useMemo(() => {
    if (!roots) return [];
    const sorted = [...roots].sort((a, b) => a.path.localeCompare(b.path));
    const map = new Map<string, RootFolder[]>();
    for (const root of sorted) {
      const parent = parentDirOf(root.path);
      const list = map.get(parent);
      if (list) list.push(root);
      else map.set(parent, [root]);
    }
    return Array.from(map.entries());
  }, [roots]);

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
    <div>
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

      {roots?.length === 0 && <div className={styles.empty}>No folders added yet.</div>}

      <div className={styles.list}>
        {groups.map(([parent, items]) => (
          <div key={parent}>
            {items.length > 2 && <div className={styles.subheader}>{displayPath(parent, home)}</div>}
            {items.map((root) => (
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
        ))}
      </div>
    </div>
  );
}

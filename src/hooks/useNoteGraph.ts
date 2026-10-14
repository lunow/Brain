import { useQuery } from "@tanstack/react-query";
import { getWorkspaceRoots, listMarkdownFiles, readFile } from "@/lib/tauri-commands";
import { buildNoteGraph, type NoteGraph, type ScannedNote } from "@/lib/noteGraph";

/* Reading the whole vault is one `readFile` IPC call per note, so they go out
   in batches rather than one at a time (serial round trips dominate on a few
   hundred notes) or all at once (thousands of concurrent calls starve the
   IPC bridge the rest of the UI runs on). */
const READ_CONCURRENCY = 24;

/** A note this big is a pasted log or generated data, not prose — reading it
 *  costs more than the one or two links it might contribute. */
const MAX_SCAN_BYTES = 2_000_000;

async function readInBatches(paths: string[]): Promise<ScannedNote[]> {
  const notes: ScannedNote[] = [];
  for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
    const batch = paths.slice(i, i + READ_CONCURRENCY);
    const contents = await Promise.all(
      // A note that can't be read (deleted mid-scan, permissions) still
      // belongs in the graph as a node — it just contributes no links.
      batch.map((path) => readFile(path).catch(() => "")),
    );
    for (let j = 0; j < batch.length; j++) notes.push({ path: batch[j], content: contents[j] });
  }
  return notes;
}

/**
 * Scans every markdown file in the open workspaces and builds the link graph.
 *
 * The scan is the expensive part of the graph view, so it lives behind
 * react-query: mounting the view again reuses the cached graph, and the
 * `markdownFiles` invalidation `useFsWatcher` already fires on any filesystem
 * change refreshes it while the view is open.
 *
 * The roots are part of the key rather than read inside the scan: opening or
 * closing a workspace folder isn't a filesystem event, so nothing invalidates
 * `markdownFiles` for it, and a graph built from the old roots would stay on
 * screen — missing the folder just added, or still drawing the one removed.
 * The key keeps the `markdownFiles` prefix so the watcher's invalidation
 * still matches.
 *
 * `enabled` keeps the scan from running at all until the graph is actually on
 * screen — no reason to read the vault while the user is writing.
 */
export function useNoteGraph(enabled: boolean) {
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots, enabled });

  return useQuery<NoteGraph>({
    queryKey: ["markdownFiles", "noteGraph", roots?.map((root) => root.path) ?? []],
    enabled: enabled && roots !== undefined,
    queryFn: async () => {
      if (!roots || roots.length === 0) return { nodes: [], edges: [], unresolvedCount: 0 };

      const listings = await Promise.all(roots.map((root) => listMarkdownFiles(root.path, true, false)));

      // Workspace roots can nest, or the same folder can be open twice under
      // different names — either way a note must appear once.
      const paths = [...new Set(listings.flat().filter((f) => f.size <= MAX_SCAN_BYTES).map((f) => f.path))];

      return buildNoteGraph(await readInBatches(paths), roots);
    },
  });
}

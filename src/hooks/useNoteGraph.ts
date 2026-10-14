import { useQuery } from "@tanstack/react-query";
import { getWorkspaceRoots, listMarkdownFiles, readFile } from "@/lib/tauri-commands";
import { buildNoteGraph, type NoteGraph, type ScannedNote } from "@/lib/noteGraph";
import { rootContaining } from "@/lib/notePaths";
import { useWorkspaceStore } from "@/stores/workspace";

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
 * Scans the selected workspace and builds the link graph of its notes.
 *
 * One workspace, not all of them: the open roots are unrelated folders —
 * separate wikis, a client's notes, a side project — and drawing them in one
 * picture produces a hairball of islands rather than a map of anything. The
 * scope follows the sidebar selection, so switching workspace switches the
 * graph.
 *
 * The scan is the expensive part of the graph view, so it lives behind
 * react-query: coming back to the view reuses the cached graph, and the
 * `markdownFiles` invalidation `useFsWatcher` already fires on any filesystem
 * change refreshes it while the view is open. The scoped root is part of the
 * key — selecting another workspace isn't a filesystem event, so nothing
 * would otherwise invalidate the old graph — and the key keeps the
 * `markdownFiles` prefix so the watcher's invalidation still matches.
 *
 * `enabled` keeps the scan from running at all until the graph is actually on
 * screen — no reason to read the vault while the user is writing.
 */
export function useNoteGraph(enabled: boolean) {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const { data: roots } = useQuery({ queryKey: ["workspaceRoots"], queryFn: getWorkspaceRoots, enabled });

  // The open file wins over the selected folder: ⌘2 from a draft should show
  // the graph that draft is part of.
  const scope = roots ? rootContaining(selectedFilePath ?? selectedFolderPath ?? "", roots) : undefined;

  const query = useQuery<NoteGraph>({
    queryKey: ["markdownFiles", "noteGraph", scope?.path ?? null],
    enabled: enabled && scope !== undefined,
    queryFn: async () => {
      if (!scope) return { nodes: [], edges: [], unresolvedCount: 0 };

      const listing = await listMarkdownFiles(scope.path, true, false);
      const paths = [...new Set(listing.filter((f) => f.size <= MAX_SCAN_BYTES).map((f) => f.path))];

      return buildNoteGraph(await readInBatches(paths), [scope]);
    },
  });

  return { ...query, scope: scope ?? null };
}

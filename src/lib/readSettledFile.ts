import { readFile } from "@/lib/tauri-commands";

const SETTLE_DELAY_MS = 150;
const SETTLE_MAX_READS = 6;

/**
 * Reads a file another program is writing, once it has stopped changing.
 * Most writers truncate the file and then fill it, and a watcher event can
 * land in between: adopting that read showed an empty or cut-off document,
 * which collapsed the scroll range and left the editor at the top of the
 * file once the full text arrived. Two identical reads a moment apart mean
 * the write is done. Returns null if the file can't be read (an atomic save
 * mid-rename, a deletion) — there's nothing to adopt then.
 */
export async function readSettledFile(path: string): Promise<string | null> {
  let previous: string | null = null;
  for (let i = 0; i < SETTLE_MAX_READS; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    let current: string;
    try {
      current = await readFile(path);
    } catch {
      previous = null;
      continue;
    }
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

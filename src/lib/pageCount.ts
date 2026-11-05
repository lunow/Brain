let worker: Worker | null = null;
let nextId = 0;

/** A document's length in A4 pages, counted by the PDF export's own layout. */
export function countPages(markdown: string): Promise<number> {
  worker ??= new Worker(new URL("./pageCount.worker.ts", import.meta.url), { type: "module" });
  const activeWorker = worker;
  const id = ++nextId;
  return new Promise((resolve) => {
    function onMessage(event: MessageEvent<{ id: number; pages: number }>) {
      if (event.data.id !== id) return;
      activeWorker.removeEventListener("message", onMessage);
      resolve(event.data.pages);
    }
    activeWorker.addEventListener("message", onMessage);
    activeWorker.postMessage({ id, markdown });
  });
}

export function formatPages(pages: number): string {
  const rounded = Math.max(0.1, Math.round(pages * 10) / 10);
  return rounded === 1 ? "≈ 1 page" : `≈ ${rounded.toFixed(1)} pages`;
}

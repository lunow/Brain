import { markdownPageCount } from "./markdownToPdf";

/* Off the main thread because the layout takes hundreds of milliseconds on a
   long document, which a keystroke arriving meanwhile would feel. */
self.onmessage = (event: MessageEvent<{ id: number; markdown: string }>) => {
  const { id, markdown } = event.data;
  self.postMessage({ id, pages: markdownPageCount(markdown) });
};

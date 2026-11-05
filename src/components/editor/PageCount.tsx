import { useEffect, useState } from "react";
import { countPages, formatPages } from "@/lib/pageCount";
import { useUiStore } from "@/stores/ui";
import styles from "./WidthToolbar.module.css";

const COUNT_DELAY_MS = 500;

/** The open document's length in pages, recounted once typing pauses. */
export function PageCount() {
  const view = useUiStore((s) => s.activeEditorView);
  const revision = useUiStore((s) => s.documentRevision);
  const [pages, setPages] = useState<number | null>(null);

  // Blank rather than showing the previous file's number under this one.
  useEffect(() => setPages(null), [view]);

  useEffect(() => {
    if (!view) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const counted = await countPages(view.state.doc.toString());
      if (!stale) setPages(counted);
    }, COUNT_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [view, revision]);

  if (pages === null) return null;
  return (
    <span className={styles.pages} title="Length as an A4 PDF, not counting images or diagrams">
      {formatPages(pages)}
    </span>
  );
}

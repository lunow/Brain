import type { ReactNode } from "react";
import { ColumnResizer } from "./ColumnResizer";
import {
  useUiStore,
  TREE_WIDTH_MIN,
  TREE_WIDTH_MAX,
  FILE_LIST_WIDTH_MIN,
  FILE_LIST_WIDTH_MAX,
} from "@/stores/ui";
import styles from "./ThreeColumnLayout.module.css";

interface ThreeColumnLayoutProps {
  tree: ReactNode;
  fileList: ReactNode;
  main: ReactNode;
}

export function ThreeColumnLayout({ tree, fileList, main }: ThreeColumnLayoutProps) {
  const treeWidth = useUiStore((s) => s.treeWidth);
  const setTreeWidth = useUiStore((s) => s.setTreeWidth);
  const fileListWidth = useUiStore((s) => s.fileListWidth);
  const setFileListWidth = useUiStore((s) => s.setFileListWidth);
  const treeVisible = useUiStore((s) => s.treeVisible);
  const fileListVisible = useUiStore((s) => s.fileListVisible);
  const fullscreenActive = useUiStore((s) => s.fullscreenActive);

  return (
    <div className={styles.layout}>
      <div className={styles.titlebarSpacer} data-tauri-drag-region />
      <div className={styles.row}>
        {treeVisible && !fullscreenActive && (
          <>
            <aside className={`${styles.column} ${styles.tree}`} style={{ width: treeWidth }}>
              {tree}
            </aside>
            <ColumnResizer width={treeWidth} onChange={setTreeWidth} min={TREE_WIDTH_MIN} max={TREE_WIDTH_MAX} />
          </>
        )}
        {fileListVisible && !fullscreenActive && (
          <>
            <aside className={`${styles.column} ${styles.fileList}`} style={{ width: fileListWidth }}>
              {fileList}
            </aside>
            <ColumnResizer
              width={fileListWidth}
              onChange={setFileListWidth}
              min={FILE_LIST_WIDTH_MIN}
              max={FILE_LIST_WIDTH_MAX}
            />
          </>
        )}
        <main className={`${styles.column} ${styles.main}`}>{main}</main>
      </div>
    </div>
  );
}

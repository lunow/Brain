import { useUiStore } from "@/stores/ui";
import { ToggleFoldersIcon, ToggleFilesIcon, ToggleSidebarIcon, FullscreenIcon } from "@/components/common/icons";
import styles from "./PanelVisibilityToggles.module.css";

/** Small icon buttons that show/hide the tree, file list, and (when
 *  relevant) right sidebar columns, plus the fullscreen (distraction-free)
 *  toggle. Lives in the always-visible main-column toolbar rather than
 *  inside the columns themselves, since a button that hides its own panel
 *  would disappear along with it. */
export function PanelVisibilityToggles() {
  const treeVisible = useUiStore((s) => s.treeVisible);
  const toggleTreeVisible = useUiStore((s) => s.toggleTreeVisible);
  const fileListVisible = useUiStore((s) => s.fileListVisible);
  const toggleFileListVisible = useUiStore((s) => s.toggleFileListVisible);
  const rightSidebarVisible = useUiStore((s) => s.rightSidebarVisible);
  const toggleRightSidebarVisible = useUiStore((s) => s.toggleRightSidebarVisible);
  const writingMode = useUiStore((s) => s.writingMode);
  const fullscreenActive = useUiStore((s) => s.fullscreenActive);
  const toggleFullscreen = useUiStore((s) => s.toggleFullscreen);

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.toggle}
        data-active={treeVisible}
        onClick={toggleTreeVisible}
        title={`${treeVisible ? "Hide" : "Show"} Workspaces (⌘D)`}
      >
        <ToggleFoldersIcon />
      </button>
      <button
        type="button"
        className={styles.toggle}
        data-active={fileListVisible}
        onClick={toggleFileListVisible}
        title={`${fileListVisible ? "Hide" : "Show"} Content (⇧⌘D)`}
      >
        <ToggleFilesIcon />
      </button>
      {writingMode !== "write" && (
        <button
          type="button"
          className={styles.toggle}
          data-active={rightSidebarVisible}
          onClick={toggleRightSidebarVisible}
          title={`${rightSidebarVisible ? "Hide" : "Show"} Sidebar (⌘J)`}
        >
          <ToggleSidebarIcon />
        </button>
      )}
      <button
        type="button"
        className={styles.toggle}
        data-active={fullscreenActive}
        onClick={toggleFullscreen}
        title={`${fullscreenActive ? "Exit" : "Enter"} Fullscreen (⇧⌘F)`}
      >
        <FullscreenIcon />
      </button>
    </div>
  );
}

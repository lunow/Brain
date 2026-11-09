import { useUiStore, hasRightSidebar } from "@/stores/ui";
import { ToggleFoldersIcon, ToggleFilesIcon, ToggleSidebarIcon, FullscreenIcon } from "@/components/common/icons";
import { Menu, useCompactToolbar, type MenuItem } from "@/components/common/Menu";
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

  if (useCompactToolbar()) {
    const items: MenuItem[] = [
      { key: "tree", label: "Workspaces", hint: "⌘D", checked: treeVisible, onSelect: toggleTreeVisible, keepOpen: true },
      {
        key: "files",
        label: "Content",
        hint: "⇧⌘D",
        checked: fileListVisible,
        onSelect: toggleFileListVisible,
        keepOpen: true,
      },
    ];
    if (hasRightSidebar(writingMode)) {
      items.push({
        key: "sidebar",
        label: "Sidebar",
        hint: "⌘J",
        checked: rightSidebarVisible,
        onSelect: toggleRightSidebarVisible,
        keepOpen: true,
      });
    }
    items.push({ key: "fullscreen", label: "Fullscreen", hint: "⇧⌘F", checked: fullscreenActive, onSelect: toggleFullscreen });
    return <Menu trigger={<ToggleFoldersIcon />} label="Layout" align="left" items={items} />;
  }

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
      {hasRightSidebar(writingMode) && (
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

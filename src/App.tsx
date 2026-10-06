import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { TreeSidebar } from "@/components/tree/TreeSidebar";
import { FileList } from "@/components/file-list/FileList";
import { FileEditor } from "@/components/editor/FileEditor";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useFsWatcher } from "@/hooks/useFsWatcher";
import { useApplyFontScale } from "@/hooks/useApplyFontScale";
import { useCliOpenFolder } from "@/hooks/useCliOpenFolder";
import { useWindowTitle } from "@/hooks/useWindowTitle";
import { useSettingsStore } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import { useEffect } from "react";

/** What the tree and the Workspaces column attach to their draggables and
 *  droppables — a filesystem entry and which kind it is. */
interface DragPayload {
  kind: string;
  path: string;
}

function App() {
  useGlobalShortcuts();
  useFsWatcher();
  useApplyFontScale();
  useCliOpenFolder();
  useWindowTitle();
  const { moveMutation } = useFileOperations();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const expandFileTreePath = useWorkspaceStore((s) => s.expandFileTreePath);

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  // A minimum drag distance keeps plain clicks (file/folder selection) from
  // being swallowed as zero-distance drags — dnd-kit's default PointerSensor
  // has no activation threshold otherwise.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as DragPayload | undefined;
    const overData = over.data.current as DragPayload | undefined;
    if (!activeData || overData?.kind !== "folder") return;
    // Files and folders both drag; only folders accept a drop. Anything else
    // registered with dnd-kit is not a filesystem entry and is ignored.
    if (activeData.kind !== "file" && activeData.kind !== "folder") return;

    const srcPath = activeData.path;
    const destDir = overData.path;

    // Dropping an entry back onto the folder it already lives in is a no-op.
    if (srcPath.slice(0, srcPath.lastIndexOf("/")) === destDir) return;
    // A folder can't be moved inside itself or inside one of its own
    // descendants: fs::rename would either fail outright or (on the
    // copy+delete fallback path) recurse into the copy it is writing.
    if (activeData.kind === "folder" && (destDir === srcPath || destDir.startsWith(srcPath + "/"))) return;

    moveMutation.mutate({ srcPath, destDir });
    // Reveal the moved entry if it landed in a collapsed Content-tree folder.
    expandFileTreePath(destDir);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <ThreeColumnLayout tree={<TreeSidebar />} fileList={<FileList />} main={<FileEditor />} />
      <CommandPalette />
      <SettingsPanel />
    </DndContext>
  );
}

export default App;

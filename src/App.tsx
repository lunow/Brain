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
    const activeData = active.data.current as { kind: string; path: string } | undefined;
    const overData = over.data.current as { kind: string; path: string } | undefined;
    if (activeData?.kind !== "file" || overData?.kind !== "folder") return;
    // Dropping a file back onto the folder it already lives in is a no-op.
    if (activeData.path.slice(0, activeData.path.lastIndexOf("/")) === overData.path) return;
    moveMutation.mutate({ srcPath: activeData.path, destDir: overData.path });
    // Reveal the moved file if it landed in a collapsed Content-tree folder.
    expandFileTreePath(overData.path);
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

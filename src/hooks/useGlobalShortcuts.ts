import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { useFileOperations } from "./useFileOperations";

/**
 * Cmd+K (jump-to-anything command palette), Cmd+N/Shift+N (new file/folder),
 * Cmd+W (close file), Cmd+1/2/3 (writing mode: Ideate/Write/Review),
 * Cmd+Shift+1/2/3 (width presets), Cmd+D/Shift+Cmd+D (toggle Workspaces/
 * Content columns), Cmd+J (toggle right sidebar), Shift+Cmd+F (toggle fullscreen),
 * Cmd+Plus/Minus/0 (app font scale — deliberately NOT the WKWebView's own
 * pinch/Cmd-zoom, which would zoom UI chrome and prose together at a fixed
 * native step; this scales the app's own rem tokens).
 */
export function useGlobalShortcuts() {
  const selectedFolderPath = useWorkspaceStore((s) => s.selectedFolderPath);
  const selectFile = useWorkspaceStore((s) => s.selectFile);
  const setWidthPreset = useUiStore((s) => s.setWidthPreset);
  const setWritingMode = useUiStore((s) => s.setWritingMode);
  const incrementFontScale = useUiStore((s) => s.incrementFontScale);
  const decrementFontScale = useUiStore((s) => s.decrementFontScale);
  const resetFontScale = useUiStore((s) => s.resetFontScale);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const toggleTreeVisible = useUiStore((s) => s.toggleTreeVisible);
  const toggleFileListVisible = useUiStore((s) => s.toggleFileListVisible);
  const toggleRightSidebarVisible = useUiStore((s) => s.toggleRightSidebarVisible);
  const toggleFullscreen = useUiStore((s) => s.toggleFullscreen);
  const { createFileMutation, createFolderMutation } = useFileOperations();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      if (key === "k") {
        e.preventDefault();
        toggleCommandPalette();
      } else if (key === "n" && e.shiftKey) {
        e.preventDefault();
        if (selectedFolderPath) createFolderMutation.mutate(selectedFolderPath);
      } else if (key === "n") {
        e.preventDefault();
        if (selectedFolderPath) createFileMutation.mutate(selectedFolderPath);
      } else if (key === "w") {
        e.preventDefault();
        selectFile(null);
      } else if (key === "d" && e.shiftKey) {
        e.preventDefault();
        toggleFileListVisible();
      } else if (key === "d") {
        e.preventDefault();
        toggleTreeVisible();
      } else if (key === "j") {
        e.preventDefault();
        toggleRightSidebarVisible();
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "1" && e.shiftKey) {
        e.preventDefault();
        setWidthPreset("narrow");
      } else if (e.key === "2" && e.shiftKey) {
        e.preventDefault();
        setWidthPreset("normal");
      } else if (e.key === "3" && e.shiftKey) {
        e.preventDefault();
        setWidthPreset("full");
      } else if (e.key === "1") {
        e.preventDefault();
        setWritingMode("ideate");
      } else if (e.key === "2") {
        e.preventDefault();
        setWritingMode("write");
      } else if (e.key === "3") {
        e.preventDefault();
        setWritingMode("review");
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        incrementFontScale();
      } else if (e.key === "-") {
        e.preventDefault();
        decrementFontScale();
      } else if (e.key === "0") {
        e.preventDefault();
        resetFontScale();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedFolderPath,
    selectFile,
    setWidthPreset,
    setWritingMode,
    createFileMutation,
    createFolderMutation,
    toggleTreeVisible,
    toggleFileListVisible,
    toggleRightSidebarVisible,
    toggleFullscreen,
    incrementFontScale,
    decrementFontScale,
    resetFontScale,
    toggleCommandPalette,
  ]);
}

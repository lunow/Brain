import { useEffect } from "react";
import { useUiStore } from "@/stores/ui";

/** Reflects the fontScale setting onto the root --app-font-scale custom
 *  property that every rem-based type token scales from. */
export function useApplyFontScale() {
  const fontScale = useUiStore((s) => s.fontScale);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-font-scale", String(fontScale));
  }, [fontScale]);
}

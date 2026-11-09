import { useEffect } from "react";
import { useAppearanceStore } from "@/stores/appearance";
import { buildPalette, isLightBackground, parseHex, PALETTE_PROPERTIES } from "@/lib/customColors";

/** Writes the custom background/contrast palette onto <html> as inline
 *  custom properties while it's enabled (overriding both the light and the
 *  OS-dark token values), and clears them when it's turned off. */
export function useApplyCustomColors() {
  const enabled = useAppearanceStore((s) => s.enabled);
  const background = useAppearanceStore((s) => s.background);
  const contrast = useAppearanceStore((s) => s.contrast);

  useEffect(() => {
    const root = document.documentElement.style;
    const palette = enabled ? buildPalette(background, contrast) : null;
    if (palette) {
      for (const [name, value] of Object.entries(palette)) root.setProperty(name, value);
      // Native scrollbars and form controls follow the background, not the OS.
      root.setProperty("color-scheme", isLightBackground(parseHex(background)!) ? "light" : "dark");
    } else {
      for (const name of PALETTE_PROPERTIES) root.removeProperty(name);
      root.removeProperty("color-scheme");
    }
  }, [enabled, background, contrast]);
}

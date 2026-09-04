import { WidgetType } from "@codemirror/view";
import mermaid from "mermaid";

// Mermaid computes its own SVG fill/stroke colors at render time (via
// khroma color math), so it can't take CSS custom properties directly the
// way the rest of the app's styling does — read the OS appearance once per
// render instead. This covers "app opened in light or dark mode" but won't
// live-update an already-rendered diagram if the OS theme flips while the
// app is open, a minor gap given how rarely that happens mid-session.
function isDarkMode(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function currentThemeVariables() {
  if (isDarkMode()) {
    return {
      background: "transparent",
      primaryColor: "#353535",
      primaryTextColor: "#e8e8e8",
      primaryBorderColor: "#6b6b6b",
      lineColor: "#8f8f8f",
      secondaryColor: "#2c2c2c",
      tertiaryColor: "#262626",
      fontFamily: "var(--font-sans)",
    };
  }
  return {
    background: "transparent",
    primaryColor: "#e8e8e8",
    primaryTextColor: "#1a1a1a",
    primaryBorderColor: "#8f8f8f",
    lineColor: "#7d7d7d",
    secondaryColor: "#f2f2f2",
    tertiaryColor: "#fafafa",
    fontFamily: "var(--font-sans)",
  };
}

let initializedForDarkMode: boolean | null = null;
function ensureInit() {
  const dark = isDarkMode();
  if (initializedForDarkMode === dark) return;
  initializedForDarkMode = dark;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: currentThemeVariables(),
  });
}

let counter = 0;

export class MermaidWidget extends WidgetType {
  constructor(private code: string) {
    super();
  }

  eq(other: MermaidWidget) {
    return other.code === this.code;
  }

  toDOM() {
    ensureInit();
    const container = document.createElement("div");
    container.className = "cm-mkMermaid";

    const id = `mermaid-diagram-${Date.now()}-${counter++}`;
    mermaid
      .render(id, this.code)
      .then(({ svg }) => {
        container.innerHTML = svg;
      })
      .catch((err: unknown) => {
        container.textContent = `Mermaid error: ${err instanceof Error ? err.message : String(err)}`;
      });

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

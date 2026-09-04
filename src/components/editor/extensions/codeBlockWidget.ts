import { WidgetType } from "@codemirror/view";
import { highlightCodeToHtml } from "./shikiHighlighter";

export class CodeBlockWidget extends WidgetType {
  constructor(
    private code: string,
    private lang: string,
  ) {
    super();
  }

  eq(other: CodeBlockWidget) {
    return other.code === this.code && other.lang === this.lang;
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-mkCodeBlockContainer";

    const fallback = document.createElement("pre");
    fallback.className = "cm-mkCodeBlockFallback";
    fallback.textContent = this.code;
    container.appendChild(fallback);

    highlightCodeToHtml(this.code, this.lang || "text")
      .then((html) => {
        container.innerHTML = html;
      })
      .catch(() => {
        // Keep the plain-text fallback already in the DOM.
      });

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

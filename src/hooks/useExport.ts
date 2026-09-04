import type { ExportKind } from "@/components/editor/ExportMenu";
import { pickSaveLocation, readFile, writeBinaryFile } from "@/lib/tauri-commands";
import { markdownToPdfBytes } from "@/lib/markdownToPdf";

function baseName(filePath: string): string {
  const withoutDir = filePath.split("/").pop() ?? filePath;
  return withoutDir.replace(/\.[^./]+$/, "");
}

function dirName(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

async function exportPdf(filePath: string) {
  const name = baseName(filePath);
  const defaultPath = `${dirName(filePath)}/${name}.pdf`;
  const target = await pickSaveLocation(defaultPath, "pdf", "PDF");
  if (!target) return;

  const content = await readFile(filePath);
  const bytes = markdownToPdfBytes(content, name);
  await writeBinaryFile(target, bytes);
}

/**
 * Centralizes the export action so both the editor toolbar's ExportMenu and
 * the Cmd+K command palette trigger the same code path.
 * TODO: wire up Word/Publish export — currently a placeholder.
 */
export function useExport() {
  function requestExport(kind: ExportKind, filePath: string | null) {
    if (!filePath) return;
    if (kind === "pdf") {
      exportPdf(filePath).catch((err) => console.error("PDF export failed", err));
      return;
    }
    console.log("export", kind, filePath);
  }

  return { requestExport };
}

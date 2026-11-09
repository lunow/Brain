import { ExportIcon } from "@/components/common/icons";
import { Menu } from "@/components/common/Menu";

const OPTIONS = [
  { key: "pdf", label: "PDF" },
  { key: "word", label: "Word" },
  { key: "publish", label: "Publish" },
  { key: "clipboard", label: "Copy to clipboard" },
] as const;

export type ExportKind = (typeof OPTIONS)[number]["key"];

export function ExportMenu({
  onExport,
  disabled = false,
}: {
  onExport: (kind: ExportKind) => void;
  disabled?: boolean;
}) {
  return (
    <Menu
      trigger={<ExportIcon />}
      label="Export"
      chevron={false}
      disabled={disabled}
      items={OPTIONS.map((opt) => ({ key: opt.key, label: opt.label, onSelect: () => onExport(opt.key) }))}
    />
  );
}

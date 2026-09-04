import type { ReactNode } from "react";
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
}

export type ContextMenuEntry = ContextMenuItem | "separator";

interface ContextMenuProps {
  items: ContextMenuEntry[];
  children: ReactNode;
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          className={styles.content}
          onCloseAutoFocus={(e) => {
            // Prevent Radix from returning focus to the trigger row on close,
            // which would steal focus away from an inline-rename input an
            // onSelect handler (e.g. "Rename") just opened and focused.
            e.preventDefault();
          }}
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <RadixContextMenu.Separator key={`sep-${i}`} className={styles.separator} />
            ) : (
              <RadixContextMenu.Item key={item.label} className={styles.item} onSelect={item.onSelect}>
                {item.label}
              </RadixContextMenu.Item>
            ),
          )}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

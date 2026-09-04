import type { PointerEvent as ReactPointerEvent } from "react";
import styles from "./ColumnResizer.module.css";

interface ColumnResizerProps {
  width: number;
  onChange: (width: number) => void;
  min: number;
  max: number;
  /** True when the resizer sits on the column's leading edge, so dragging
   *  right should shrink rather than grow it (e.g. a right-hand sidebar). */
  invert?: boolean;
}

/** A thin draggable divider that resizes an adjacent flex column. Renders a
 *  1px hairline with a wider invisible hit area so it's easy to grab. */
export function ColumnResizer({ width, onChange, min, max, invert = false }: ColumnResizerProps) {
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    const sign = invert ? -1 : 1;

    function handlePointerMove(moveEvent: PointerEvent) {
      const delta = (moveEvent.clientX - startX) * sign;
      onChange(Math.min(max, Math.max(min, startWidth + delta)));
    }

    function handlePointerUp(upEvent: PointerEvent) {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", handlePointerMove);
      handle.removeEventListener("pointerup", handlePointerUp);
    }

    handle.addEventListener("pointermove", handlePointerMove);
    handle.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      className={styles.resizer}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="vertical"
    />
  );
}

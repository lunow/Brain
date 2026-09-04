import { useEffect, useRef, useState } from "react";

/**
 * Escape/ArrowUp/ArrowDown/Enter navigation over a flat list, plus the
 * bookkeeping that goes with it: clamping the active index when the list
 * shrinks, and scrolling the active row into view. Generic on purpose —
 * any keyboard-navigable overlay list (currently just the command palette)
 * can reuse this instead of re-deriving it.
 */
export function useListKeyboardNav<T>(params: {
  /** Only listens for keydowns while true (e.g. the owning panel is open). */
  active: boolean;
  items: T[];
  onSelect: (item: T) => void;
  onEscape: () => void;
}) {
  const { active, items, onSelect, onEscape } = params;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveIndex((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) onSelect(item);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items, activeIndex]);

  return { activeIndex, setActiveIndex, activeItemRef };
}

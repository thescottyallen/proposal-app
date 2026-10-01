"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a panel on document.body, anchored to an element, so parent
 * overflow cannot clip it. Flips above the anchor when there is more
 * room there than below, then clamps it inside the viewport.
 */
export function AnchoredPanel({
  anchor,
  onClose,
  children,
  className = "",
  matchAnchorWidth = false,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  matchAnchorWidth?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width?: number } | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const place = () => {
      if (!anchor.isConnected) return;
      const anchorRect = anchor.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const width = matchAnchorWidth ? anchorRect.width : panel.offsetWidth || 256;
      if (panel.style.width !== `${width}px`) panel.style.width = `${width}px`;
      const height = panel.offsetHeight;
      const spaceBelow = window.innerHeight - anchorRect.bottom - gap - margin;
      const spaceAbove = anchorRect.top - gap - margin;
      const openAbove = spaceBelow < height && spaceAbove > spaceBelow;

      let top = openAbove ? anchorRect.top - gap - height : anchorRect.bottom + gap;
      let left = matchAnchorWidth
        ? anchorRect.left
        : anchorRect.left + anchorRect.width / 2 - width / 2;

      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - Math.min(height, window.innerHeight - margin * 2) - margin));

      setBox((prev) => {
        if (prev && prev.top === top && prev.left === left && prev.width === width) return prev;
        return { top, left, width };
      });
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, matchAnchorWidth]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div
        ref={panelRef}
        data-testid="anchored-panel"
        className={`fixed z-[90] max-h-[calc(100vh-16px)] overflow-y-auto ${className}`}
        style={{
          top: box?.top ?? 0,
          left: box?.left ?? 0,
          width: box?.width,
          visibility: box ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

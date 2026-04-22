"use client";

import { useState, type ReactNode } from "react";

/**
 * Wraps a list of rows with collapse-past-N behaviour. Renders the first
 * `initialVisible` items; a button at the bottom reveals the rest in place.
 *
 * Used inside the contact profile page to keep long Organization /
 * Project sections from making the page scroll eternally.
 */
export function CollapsibleList<T>({
  items,
  initialVisible = 5,
  render,
  moreLabel = "more",
  collapseLabel = "Show less",
}: {
  items:          T[];
  initialVisible?: number;
  render:         (item: T, index: number) => ReactNode;
  moreLabel?:     string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, initialVisible);
  const hidden  = items.length - visible.length;

  return (
    <>
      {visible.map((it, i) => render(it, i))}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80 hover:bg-[#EFEFEA]/40 border-t border-[#EFEFEA] transition-colors"
        >
          {expanded ? collapseLabel : `Show ${hidden} ${moreLabel}`}
        </button>
      )}
    </>
  );
}

"use client";

import { useState, Children, type ReactNode } from "react";

/**
 * Wraps a list of rows with collapse-past-N behaviour. Server components
 * pre-render all children; this component just toggles which ones are shown.
 *
 * Functions can't be passed as props from server to client components, so
 * this one accepts pre-rendered React children (not a render callback).
 *
 * Used inside the contact profile page to keep long Organization / Project /
 * Timeline / WhatsApp lists from making the page scroll eternally.
 */
export function CollapsibleList({
  children,
  initialVisible = 5,
  moreLabel = "more",
  collapseLabel = "Show less",
}: {
  children:       ReactNode;
  initialVisible?: number;
  moreLabel?:     string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const kids = Children.toArray(children);
  if (kids.length === 0) return null;

  const visible = expanded ? kids : kids.slice(0, initialVisible);
  const hidden  = kids.length - visible.length;

  return (
    <>
      {visible}
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

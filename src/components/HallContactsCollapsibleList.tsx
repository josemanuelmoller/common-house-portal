"use client";

import { useState } from "react";
import { HallContactRow } from "./HallContactRow";

type Row = React.ComponentProps<typeof HallContactRow>;

type Props = {
  rows: Row[];
  /** Number of rows to show before the expand button. */
  initialVisible?: number;
  /** Text for the empty state. */
  emptyText?: string;
};

/**
 * Renders a list of HallContactRow with collapse-past-N behaviour.
 * Shows the most-recently-touched N rows by default (sort order comes from
 * the server component), a pill summarising how many are hidden, and a
 * "Show all" toggle that expands the full list in place.
 */
export function HallContactsCollapsibleList({
  rows,
  initialVisible = 5,
  emptyText = "Nothing here yet.",
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] px-5 py-8 text-center">
        <p className="text-sm text-[#0a0a0a]/25">{emptyText}</p>
      </div>
    );
  }

  const visibleRows = expanded ? rows : rows.slice(0, initialVisible);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="divide-y divide-[#f4f4ef]">
        {visibleRows.map(r => <HallContactRow key={r.email} {...r} />)}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#0a0a0a]/40 hover:text-[#0a0a0a]/80 hover:bg-[#f4f4ef]/40 border-t border-[#f4f4ef] transition-colors"
        >
          Show all ({rows.length})  →
        </button>
      )}
      {expanded && rows.length > initialVisible && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#0a0a0a]/40 hover:text-[#0a0a0a]/80 hover:bg-[#f4f4ef]/40 border-t border-[#f4f4ef] transition-colors"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

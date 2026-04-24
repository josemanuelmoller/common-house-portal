"use client";

import { useState } from "react";
import { HallContactRow } from "./HallContactRow";

type Row = React.ComponentProps<typeof HallContactRow> & {
  dismissed_reason: string | null;
};

type Props = {
  rows: Row[];
};

/**
 * Collapsed-by-default list of dismissed contacts. Jose clicks the
 * header to expand — undo is still available via each row's editor
 * (un-dismiss is a POST /api/hall-contacts with action='undismiss').
 */
export function HallContactsDismissedToggle({ rows }: Props) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-2 group"
      >
        <h2 className="text-[10px] font-bold tracking-widest uppercase text-[#0a0a0a]/40 group-hover:text-[#0a0a0a]/70 transition-colors">
          Dismissed {open ? "▾" : "▸"}
        </h2>
        <div className="flex-1 h-px bg-[#e4e4dd]" />
        <span className="text-[10px] font-semibold text-[#0a0a0a]/30">{rows.length}</span>
      </button>
      {open && (
        <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden divide-y divide-[#f4f4ef] opacity-75">
          {rows.map(r => (
            <div key={r.email}>
              <HallContactRow {...r} />
              {r.dismissed_reason && (
                <p className="px-5 pb-2 text-[9px] text-[#0a0a0a]/40 italic">
                  Dismissed: {r.dismissed_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

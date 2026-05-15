"use client";

import { useState } from "react";

type ResolvedItem = {
  logId: string;
  name: string;
  reason: "ball_with_jose" | "ball_with_them" | "drift" | "pre_meeting";
  resolution: "manual_done" | "outbound_sent" | "inbound_reply" | "meeting_completed" | "item_closed";
  resolvedAt: string;
};

const RESOLUTION_LABEL: Record<ResolvedItem["resolution"], string> = {
  manual_done:       "manual",
  outbound_sent:     "outbound sent",
  inbound_reply:     "inbound reply",
  meeting_completed: "meeting completed",
  item_closed:       "item closed",
};

export function HallPipelineStateResolved({
  resolved,
  snoozedCount,
}: {
  resolved: ResolvedItem[];
  snoozedCount: number;
}) {
  const [open, setOpen] = useState(false);

  if (resolved.length === 0 && snoozedCount === 0) return null;

  return (
    <div
      className="mt-3 pt-2.5"
      style={{ borderTop: "1px dashed var(--hall-line-soft)", fontFamily: "var(--font-hall-sans)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em] font-bold w-full text-left"
        style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
      >
        <span style={{ color: "var(--hall-ok)" }}>✓</span>
        Resolved today ({resolved.length})
        {snoozedCount > 0 && (
          <>
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <span>{snoozedCount} snoozed</span>
          </>
        )}
        <span style={{ marginLeft: "auto" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && resolved.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {resolved.map(r => (
            <li
              key={r.logId}
              className="flex items-center gap-2 text-[11px]"
              style={{ color: "var(--hall-muted-1)" }}
            >
              <span style={{ color: "var(--hall-muted-3)" }}>↳</span>
              <span style={{ color: "var(--hall-ink-1)" }}>{r.name}</span>
              <span style={{ color: "var(--hall-muted-3)" }}>·</span>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {RESOLUTION_LABEL[r.resolution]}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  color: "var(--hall-muted-3)",
                }}
              >
                {formatTime(r.resolvedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

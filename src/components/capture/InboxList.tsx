"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type InboxRowForList = {
  id: string;
  created_at: string;
  source: "quick_capture" | "share_target" | "voice_capture";
  raw_text: string | null;
  user_notes_to_agent: string | null;
  user_type_override: string | null;
  user_due_date: string | null;
  photo_path: string | null;
  audio_path: string | null;
  agent_type: string | null;
  agent_priority: "P1" | "P2" | "P3" | null;
  agent_due_date: string | null;
  agent_confidence: number | null;
  status: string;
  photo_url?: string | null;
  audio_url?: string | null;
};

type Props = {
  rows: InboxRowForList[];
  emptyMessage?: string;
};

export function InboxList({ rows, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <p
        className="py-6 text-[13px]"
        style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
      >
        {emptyMessage || "Sin items por aquí."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <InboxRowCard key={r.id} row={r} />
      ))}
    </ul>
  );
}

function InboxRowCard({ row }: { row: InboxRowForList }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function patchStatus(next: "done" | "archived") {
    setBusy(true);
    setHidden(true); // optimistic remove from list
    try {
      const res = await fetch(`/api/inbox/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      // revert optimistic state
      setHidden(false);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  const type = row.user_type_override || row.agent_type || null;
  const priority = row.agent_priority;
  const due = row.user_due_date || row.agent_due_date;

  return (
    <li
      className="rounded-md p-3 sm:p-4"
      style={{
        background: "var(--hall-paper-1)",
        border: "1px solid var(--hall-line)",
      }}
    >
      <div className="flex items-start gap-3">
        {row.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.photo_url}
            alt=""
            className="w-16 h-16 object-cover rounded-sm flex-shrink-0"
            style={{ background: "var(--hall-paper-0)" }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center flex-wrap gap-1.5 text-[10px] mb-1"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
            }}
          >
            <span>{formatRelative(row.created_at)}</span>
            <Dot />
            <SourceBadge source={row.source} />
            {type && (
              <>
                <Dot />
                <TypeBadge type={type} />
              </>
            )}
            {priority && (
              <>
                <Dot />
                <PriorityBadge priority={priority} />
              </>
            )}
            {due && (
              <>
                <Dot />
                <span>vence {formatDate(due)}</span>
              </>
            )}
          </div>
          {row.raw_text && (
            <p
              className="text-[14px] leading-snug whitespace-pre-wrap"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {row.raw_text}
            </p>
          )}
          {row.audio_url && (
            <audio src={row.audio_url} controls className="mt-2 w-full" preload="none" />
          )}
          {row.user_notes_to_agent && (
            <p
              className="mt-1.5 text-[11.5px] italic"
              style={{ color: "var(--hall-muted-2)" }}
            >
              → {row.user_notes_to_agent}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-2.5">
        <button
          type="button"
          onClick={() => patchStatus("archived")}
          disabled={busy}
          className="text-[11px] px-2.5 py-1.5 rounded-sm disabled:opacity-50"
          style={{
            color: "var(--hall-muted-2)",
            border: "1px solid var(--hall-line)",
            fontFamily: "var(--font-hall-mono)",
          }}
        >
          Archivar
        </button>
        <button
          type="button"
          onClick={() => patchStatus("done")}
          disabled={busy}
          className="text-[11px] px-2.5 py-1.5 rounded-sm disabled:opacity-50"
          style={{
            background: "var(--hall-ink-0)",
            color: "var(--hall-paper-0)",
            fontFamily: "var(--font-hall-mono)",
          }}
        >
          ✓ Listo
        </button>
      </div>
    </li>
  );
}

function Dot() {
  return <span aria-hidden>·</span>;
}

function SourceBadge({ source }: { source: string }) {
  const label =
    source === "share_target"
      ? "share"
      : source === "voice_capture"
        ? "voz"
        : "captura";
  return <span>{label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  return <span>{type}</span>;
}

function PriorityBadge({ priority }: { priority: "P1" | "P2" | "P3" }) {
  const color =
    priority === "P1"
      ? "var(--hall-danger)"
      : priority === "P2"
        ? "var(--hall-warn)"
        : "var(--hall-muted-2)";
  return <span style={{ color, fontWeight: 600 }}>{priority}</span>;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

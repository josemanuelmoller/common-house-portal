"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxActionWithDraftView, DraftStatus } from "@/lib/action-items";

type Props = {
  item: InboxActionWithDraftView;
  draftAgeLabel: string;
};

export function InboxDraftRow({ item, draftAgeLabel }: Props) {
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  async function handleApproveSend() {
    if (!item.draft) return;
    setFeedback("Sending…");
    const res = await fetch("/api/approve-and-send-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: item.draft.draftId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setFeedback("Sent ✓");
      startTransition(() => router.refresh());
    } else {
      setFeedback(`Failed: ${data.reason ?? data.error ?? "unknown"}`);
    }
  }

  async function handleNudge() {
    setFeedback("Drafting…");
    const res = await fetch("/api/hall/nudge-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId:    item.threadId,
        toEmail:     item.from || "",
        toName:      item.fromName,
        subject:     item.subject,
        snippet:     item.snippet,
        classes:     [item.label.toLowerCase()],
        daysWaiting: item.daysWaiting,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setFeedback("Draft created ✓");
      startTransition(() => router.refresh());
    } else {
      setFeedback(`Failed: ${data.error ?? "unknown"}`);
    }
  }

  return (
    <li
      className="grid grid-cols-[24px_1.4fr_2fr_120px_140px_140px] gap-3 items-center px-1 py-3"
      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
    >
      {/* Priority dot */}
      <span
        className="w-2 h-2 rounded-full"
        style={{
          background:
            item.label === "Urgent"
              ? "var(--hall-danger)"
              : item.label === "Needs Reply"
              ? "var(--hall-warn)"
              : "var(--hall-muted-3)",
        }}
      />

      {/* From */}
      <div className="min-w-0">
        <p
          className="truncate"
          style={{
            fontFamily: "var(--font-hall-sans)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--hall-ink-0)",
          }}
        >
          {item.fromName || item.from || "—"}
        </p>
        <p
          className="truncate"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 9.5,
            color: "var(--hall-muted-3)",
          }}
        >
          {item.from || ""}
        </p>
      </div>

      {/* Subject + next action */}
      <div className="min-w-0">
        <a
          href={item.gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate hover:underline"
          style={{
            fontSize: 12,
            color: "var(--hall-ink-0)",
          }}
        >
          {item.subject}
        </a>
        {item.summary && (
          <p
            className="truncate"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-2)",
              marginTop: 2,
            }}
          >
            → {item.summary}
          </p>
        )}
      </div>

      {/* Waiting */}
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10.5,
          color: item.daysWaiting > 3 ? "var(--hall-warn)" : "var(--hall-muted-2)",
        }}
      >
        {item.daysWaiting === 0 ? "today" : `${item.daysWaiting}d`}
      </p>

      {/* Draft status badge */}
      <DraftBadge draft={item.draft} ageLabel={draftAgeLabel} />

      {/* Action button */}
      <div className="flex items-center justify-end">
        {feedback ? (
          <span
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: feedback.startsWith("Failed")
                ? "var(--hall-danger)"
                : "var(--hall-ok)",
            }}
          >
            {feedback}
          </span>
        ) : !item.draft ? (
          <button
            onClick={handleNudge}
            disabled={busy}
            className="hall-btn-ghost"
            style={{ fontSize: 11 }}
          >
            {busy ? "…" : "Draft"}
          </button>
        ) : item.draft.status === "approved" ? (
          <button
            onClick={handleApproveSend}
            disabled={busy}
            className="hall-btn-primary"
            style={{ fontSize: 11 }}
          >
            {busy ? "…" : "Send"}
          </button>
        ) : item.draft.status === "ready" ? (
          <button
            onClick={handleApproveSend}
            disabled={busy}
            className="hall-btn-primary"
            style={{ fontSize: 11 }}
          >
            {busy ? "…" : "Approve & send"}
          </button>
        ) : item.draft.status === "stale" ? (
          <button
            onClick={handleNudge}
            disabled={busy}
            className="hall-btn-ghost"
            style={{ fontSize: 11 }}
            title="Regenerate fresh draft (old one will be archived)"
          >
            {busy ? "…" : "Regen"}
          </button>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-3)",
            }}
          >
            —
          </span>
        )}
      </div>
    </li>
  );
}

function DraftBadge({
  draft,
  ageLabel,
}: {
  draft: InboxActionWithDraftView["draft"];
  ageLabel: string;
}) {
  if (!draft) {
    return (
      <span
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
        }}
      >
        —
      </span>
    );
  }

  const styles = badgeStyle(draft.status);
  const label = badgeLabel(draft.status, ageLabel);

  return (
    <span
      className="px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: styles.fg,
        background: styles.bg,
      }}
      title={draft.title ?? undefined}
    >
      {label}
    </span>
  );
}

function badgeStyle(status: DraftStatus): { fg: string; bg: string } {
  switch (status) {
    case "ready":
      return { fg: "var(--hall-ok)", bg: "var(--hall-ok-soft)" };
    case "approved":
      return { fg: "var(--hall-ok)", bg: "var(--hall-ok-soft)" };
    case "sent":
      return { fg: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" };
    case "stale":
      return { fg: "var(--hall-warn)", bg: "var(--hall-warn-soft)" };
    case "auto_archived":
      return { fg: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" };
    default:
      return { fg: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" };
  }
}

function badgeLabel(status: DraftStatus, ageLabel: string): string {
  switch (status) {
    case "ready":
      return `Ready · ${ageLabel}`;
    case "approved":
      return `Approved · ${ageLabel}`;
    case "sent":
      return `Sent · ${ageLabel}`;
    case "stale":
      return `Stale · ${ageLabel}`;
    case "auto_archived":
      return `Archived · ${ageLabel}`;
    default:
      return "—";
  }
}

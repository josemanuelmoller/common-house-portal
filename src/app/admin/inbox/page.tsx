/**
 * /admin/inbox
 *
 * Cross-view of warm inbox threads + their associated agent drafts.
 * Shows at a glance: which inbound emails have a draft ready, which
 * have a stale one, and which have no draft yet.
 *
 * Source: action_items (source_type=gmail, ball_in_court=jose, status=open)
 *         LEFT JOIN notion_agent_drafts on gmail_thread_id.
 */

import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { getInboxActionsWithDrafts } from "@/lib/action-items";
import { InboxDraftRow } from "./row-client";

export const dynamic = "force-dynamic";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default async function InboxPage() {
  await requireAdmin();

  const items = await getInboxActionsWithDrafts(40);

  // Bucket by draft status for the summary strip
  const buckets = {
    ready:        items.filter(i => i.draft?.status === "ready").length,
    approved:     items.filter(i => i.draft?.status === "approved").length,
    sent:         items.filter(i => i.draft?.status === "sent").length,
    stale:        items.filter(i => i.draft?.status === "stale").length,
    none:         items.filter(i => !i.draft).length,
    autoArchived: items.filter(i => i.draft?.status === "auto_archived").length,
  };

  const headerMeta = (
    <div className="flex items-center gap-2">
      <a href="/admin/control-plane" className="hall-btn-ghost" style={{ fontSize: 11 }}>
        Control plane ↗
      </a>
    </div>
  );

  return (
    <PortalShell
      eyebrow={{ label: "INBOX + DRAFTS", accent: `${items.length} WARM` }}
      title="Warm inbox"
      flourish="& drafts"
      meta={headerMeta}
      subtitle="Threads waiting on you, joined with the agent draft (if any). No more clicking through Agent Queue to know which email already has a reply."
    >
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KPI label="No draft"      value={String(buckets.none)}      color="var(--hall-muted-2)" />
        <KPI label="Draft ready"   value={String(buckets.ready)}     color="var(--hall-ok)" />
        <KPI label="Approved"      value={String(buckets.approved)}  color="var(--hall-ok)" />
        <KPI label="Stale"         value={String(buckets.stale)}     color="var(--hall-warn)" />
        <KPI label="Sent"          value={String(buckets.sent)}      color="var(--hall-muted-3)" />
      </div>

      {/* Main list */}
      <HallSection
        title="Threads"
        flourish="needing reply"
        meta={`${items.length} OPEN · BALL IN YOUR COURT`}
      >
        {items.length === 0 ? (
          <div
            className="px-4 py-8 text-center"
            style={{ border: "1px dashed var(--hall-line)" }}
          >
            <p
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 11,
                color: "var(--hall-muted-3)",
              }}
            >
              No warm threads waiting. Inbox zero.
            </p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div
              className="hidden md:grid grid-cols-[24px_1.4fr_2fr_120px_140px_140px] gap-3 items-center px-1 py-2"
              style={{ borderBottom: "1px solid var(--hall-line)" }}
            >
              {["", "From", "Subject", "Waiting", "Draft", "Action"].map((h) => (
                <p
                  key={h}
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  {h}
                </p>
              ))}
            </div>

            {/* Rows */}
            <ul className="flex flex-col">
              {items.map((item) => (
                <InboxDraftRow
                  key={item.actionItemId}
                  item={item}
                  draftAgeLabel={
                    item.draft?.lastEditedAt ? relativeTime(item.draft.lastEditedAt) : "—"
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </HallSection>

      {/* Footer note */}
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
        }}
      >
        Drafts older than 48h get marked stale; older than 5d get auto-archived
        by the daily reaper. <code>gmail_thread_id</code> populated by{" "}
        <code>/api/hall/nudge-draft</code> (ad-hoc replies). Cron-generated
        drafts (opportunity-based) appear in /admin Agent Queue without thread
        link.
      </p>
    </PortalShell>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3" style={{ border: "1px solid var(--hall-line)" }}>
      <p
        className="mb-1"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        {label}
      </p>
      <p
        className="text-[1.5rem] font-[900] leading-none tracking-tight"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}


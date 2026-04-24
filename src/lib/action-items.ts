/**
 * action-items.ts — Read/write API for the normalized action_items layer.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §7.3 (layer) and §12 (surface contract).
 *
 * Every Hall/CoS surface that wants to render actionable items reads from
 * here. Never reads the substrate directly (Gmail API, loops table, etc.).
 * Writes happen only through resolveActionItem() — ingestors create rows,
 * surfaces close them.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Keep this shape compatible with the existing InboxTriage client component
 * (see src/components/InboxTriage.tsx) so the Phase 3 cutover swaps only
 * the data source, not the UI.
 */
export type InboxActionView = {
  /** action_items.id — use for resolution calls. */
  actionItemId: string;
  /** source_id — the Gmail thread id, used for the Gmail URL. */
  threadId: string;
  subject: string;
  from: string;       // counterparty email when resolved, else ""
  fromName: string;   // counterparty display name
  snippet: string;    // next_action (the imperative line generated at ingest)
  daysWaiting: number;
  isUnread: boolean;  // derived: true when priority band is critical
  label: "Urgent" | "Needs Reply" | "FYI";
  reason: string;     // next_action (duplicate of snippet — kept for legacy UI)
  gmailUrl: string;
  summary: string | null;
};

const DEFAULT_INBOX_LIMIT = 20;

// ─── Reads ────────────────────────────────────────────────────────────────

/**
 * Items to render on Hall Inbox ("needs attention"). Query from §12 of the
 * architecture doc: source_type='gmail', ball_in_court='jose', status='open',
 * ordered by priority_score then recency.
 */
export async function getInboxActions(limit = DEFAULT_INBOX_LIMIT): Promise<InboxActionView[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("action_items")
    .select(
      "id, source_id, source_url, subject, counterparty, counterparty_contact_id, " +
      "next_action, priority_score, last_motion_at"
    )
    .eq("source_type", "gmail")
    .eq("ball_in_court", "jose")
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .order("last_motion_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Fail visible, not silent — per CLAUDE.md fallback observability rule
    console.error("[getInboxActions] supabase error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    source_id: string;
    source_url: string | null;
    subject: string;
    counterparty: string | null;
    counterparty_contact_id: string | null;
    next_action: string | null;
    priority_score: number;
    last_motion_at: string;
  }>;

  // Resolve counterparty emails in a single batch
  const contactIds = rows
    .map(r => r.counterparty_contact_id)
    .filter((v): v is string => !!v);
  const emailByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: people } = await sb
      .from("people")
      .select("id, email")
      .in("id", contactIds);
    for (const p of (people ?? []) as { id: string; email: string | null }[]) {
      if (p.email) emailByContactId.set(p.id, p.email);
    }
  }

  const now = Date.now();
  return rows.map(r => {
    const lastMotionMs = new Date(r.last_motion_at).getTime();
    const daysWaiting = Math.max(0, Math.floor((now - lastMotionMs) / 86_400_000));
    const score = r.priority_score;
    const label: InboxActionView["label"] =
      score >= 70 ? "Urgent" : score >= 40 ? "Needs Reply" : "FYI";
    const nextAction = r.next_action ?? "";
    // UX mapping (matches what the client component actually renders):
    //   summary (headline)        = imperative next_action
    //   fromName · reason (subtitle) = "Counterparty · Original email subject"
    //   snippet                   = subject (used by createCandidate payload)
    return {
      actionItemId: r.id,
      threadId: r.source_id,
      subject: r.subject,
      from: r.counterparty_contact_id
        ? emailByContactId.get(r.counterparty_contact_id) ?? ""
        : "",
      fromName: r.counterparty ?? "",
      snippet: r.subject,
      daysWaiting,
      isUnread: score >= 70,
      label,
      reason: r.subject,
      gmailUrl: r.source_url ?? "",
      summary: nextAction || null,
    };
  });
}

/**
 * Items for the Hall Commitments surface (I OWE / OWED TO ME).
 *
 * Query from architecture doc §12: intents that represent explicit
 * commitments (deliver, chase, follow_up, close_loop) with ball_in_court=jose
 * and status=open. Gmail replies (intent=reply) are NOT commitments — they
 * belong to the Inbox surface.
 *
 * Owner partitioning:
 *   owner='jose'   = intent ∈ {deliver, follow_up, close_loop}
 *                    (Jose committed to do it)
 *   owner='others' = intent='chase'
 *                    (someone else committed to Jose; he chases)
 */
export type CommitmentActionView = {
  actionItemId: string;
  title: string;
  snippet: string;
  daysAgo: number;
  owner: "jose" | "others";
  sourceType: string;
  sourceUrl: string;
  intent: string;
  priorityScore: number;
};

export async function getCommitmentActions(limit = 60): Promise<CommitmentActionView[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("action_items")
    .select(
      "id, source_type, source_url, subject, counterparty, next_action, " +
      "intent, priority_score, last_motion_at"
    )
    .in("intent", ["deliver", "chase", "follow_up", "close_loop"])
    .eq("ball_in_court", "jose")
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .order("last_motion_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[getCommitmentActions] supabase error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    source_url: string | null;
    subject: string;
    counterparty: string | null;
    next_action: string | null;
    intent: string;
    priority_score: number;
    last_motion_at: string;
  }>;

  const now = Date.now();
  return rows.map(r => {
    const daysAgo = Math.max(0, Math.floor((now - new Date(r.last_motion_at).getTime()) / 86_400_000));
    const owner: "jose" | "others" = r.intent === "chase" ? "others" : "jose";
    return {
      actionItemId: r.id,
      title:        r.next_action ?? r.subject,
      snippet:      r.counterparty ? `${r.counterparty} · ${r.subject}` : r.subject,
      daysAgo,
      owner,
      sourceType:   r.source_type,
      sourceUrl:    r.source_url ?? "",
      intent:       r.intent,
      priorityScore: r.priority_score,
    };
  });
}

/** Count of open gmail actions (for the "X TOTAL" meta label). */
export async function countOpenGmailActions(): Promise<number> {
  const sb = getSupabaseServerClient();
  const { count, error } = await sb
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "gmail")
    .eq("ball_in_court", "jose")
    .eq("status", "open");
  if (error) return 0;
  return count ?? 0;
}

// ─── Writes (resolution) ──────────────────────────────────────────────────

const VALID_RESOLUTION_REASONS = new Set([
  "manual_done",
  "manual_dismiss",
] as const);
export type ManualResolutionReason = "manual_done" | "manual_dismiss";

export function isValidResolutionReason(s: string): s is ManualResolutionReason {
  return VALID_RESOLUTION_REASONS.has(s as ManualResolutionReason);
}

/**
 * Close an action item. Called by the surface (via the /api/action-items/:id/resolve
 * route). Idempotent — closing an already-resolved row is a no-op.
 *
 * Reasons map to status per docs/NORMALIZATION_ARCHITECTURE.md §10:
 *   manual_done     → status = 'resolved'
 *   manual_dismiss  → status = 'dismissed'
 */
export async function resolveActionItem(params: {
  id: string;
  reason: ManualResolutionReason;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseServerClient();
  const status = params.reason === "manual_done" ? "resolved" : "dismissed";
  const { error } = await sb
    .from("action_items")
    .update({
      status,
      resolved_at:     new Date().toISOString(),
      resolved_reason: params.reason,
    })
    .eq("id", params.id)
    .eq("status", "open"); // guard: don't overwrite already-closed rows
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

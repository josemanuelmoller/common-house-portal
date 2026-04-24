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

// ─── CoS desk adapter ─────────────────────────────────────────────────────
/**
 * Items for the Chief-of-Staff desk. Adapts action_items rows to the
 * CoSTask shape that the ChiefOfStaffDesk client component expects, so
 * the migration swaps the data source without rewriting the UI.
 *
 * Surface query (see architecture doc §12):
 *   ball_in_court='jose' OR founder_owned=true OR (ball_in_court='team' AND owner_person_id IS NULL)
 *   AND status='open' AND priority_score >= 40
 *   ORDER BY priority_score DESC
 */
// Shape-compatible with CoSTask in src/lib/notion.ts (extra `action_item`
// taskSource is additive — cast at the call-site rather than broadening
// the shared type until all CoS consumers are migrated).
type CoSTaskLike = {
  id: string;
  notionUrl: string;
  linkedEntityId?: string;
  taskTitle: string;
  taskStatus: "todo" | "in-progress" | "waiting" | "done" | "dropped";
  dueDate: string | null;
  urgency: "critical" | "high" | "normal";
  loopType: "blocker" | "commitment" | "decision" | "prep" | "follow-up" | "review";
  interventionMoment: "urgent" | "next_meeting" | "email_this_week" | "review_this_week" | "this_week";
  opportunityName: string;
  opportunityStage: string;
  orgName: string;
  opportunityType: string;
  reviewUrl: string | null;
  entrySignal: "meeting_soon" | "proposal_pending" | "negotiation" | "manual" | "review_needed" | "inbound";
  signalReason: string;
  calendarBlockUrl: string | null;
  pendingAction: string | null;
  taskSource?: "opportunity" | "project" | "evidence";
};

function intentToLoopType(intent: string): CoSTaskLike["loopType"] {
  switch (intent) {
    case "deliver":   return "commitment";
    case "chase":     return "follow-up";
    case "decide":    return "decision";
    case "approve":   return "decision";
    case "review":    return "review";
    case "prep":      return "prep";
    case "follow_up": return "follow-up";
    default:          return "follow-up";
  }
}

function intentToIntervention(intent: string, score: number): CoSTaskLike["interventionMoment"] {
  if (score >= 70) return "urgent";
  if (intent === "prep") return "next_meeting";
  if (intent === "review") return "review_this_week";
  if (intent === "reply" || intent === "chase") return "email_this_week";
  return "this_week";
}

export async function getCoSActions(limit = 40): Promise<CoSTaskLike[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("action_items")
    .select(
      "id, source_type, source_id, source_url, subject, counterparty, next_action, " +
      "intent, priority_score, last_motion_at, deadline, founder_owned, owner_person_id, ball_in_court"
    )
    .eq("status", "open")
    .gte("priority_score", 40)
    .order("priority_score", { ascending: false })
    .order("last_motion_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getCoSActions] supabase error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    source_id: string;
    source_url: string | null;
    subject: string;
    counterparty: string | null;
    next_action: string | null;
    intent: string;
    priority_score: number;
    last_motion_at: string;
    deadline: string | null;
    founder_owned: boolean | null;
    owner_person_id: string | null;
    ball_in_court: string;
  }>;

  // Apply the Phase 6 surface rule: jose OR founder_owned OR team-without-owner
  const filtered = rows.filter(r =>
    r.ball_in_court === "jose" ||
    r.founder_owned === true ||
    (r.ball_in_court === "team" && !r.owner_person_id)
  );

  return filtered.map(r => {
    const score = r.priority_score;
    const urgency: CoSTaskLike["urgency"] =
      score >= 70 ? "critical" : score >= 40 ? "high" : "normal";
    return {
      id: r.id,
      notionUrl: r.source_url ?? "",
      linkedEntityId: r.source_id ?? undefined,
      taskTitle: r.next_action ?? r.subject,
      taskStatus: "todo",
      dueDate: r.deadline,
      urgency,
      loopType: intentToLoopType(r.intent),
      interventionMoment: intentToIntervention(r.intent, score),
      opportunityName: r.subject,
      opportunityStage: r.intent,
      orgName: r.counterparty ?? "",
      opportunityType: r.source_type,
      reviewUrl: r.source_url,
      entrySignal: "manual",
      signalReason: `${r.source_type} · score ${score}`,
      calendarBlockUrl: null,
      pendingAction: r.counterparty ? `${r.counterparty} · ${r.subject}` : r.subject,
      // taskSource left undefined on purpose — the "action_item" source is
      // rendered by ChiefOfStaffDesk like a generic manual task (no Notion
      // field to flip on click). Consumers that branch on taskSource fall
      // through to the default "todo" behaviour.
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

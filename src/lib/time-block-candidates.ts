/**
 * time-block-candidates.ts
 * Layer B of Suggested Time Blocks — Work Candidate Engine.
 *
 * Produces a ranked list of specific, actionable candidates from:
 *   - loops           (Supabase)
 *   - opportunities   (Supabase)
 *   - upcoming meetings (Google Calendar) — for prep + follow-up candidates
 *
 * Each candidate carries enough context for the matcher to assign it to a slot:
 *   title, entity ref, estimated duration, task_type, urgency_score,
 *   why_now, expected_outcome, optional hard time constraint.
 */

import { getSupabaseServerClient } from "./supabase-server";
import type { UpcomingMeeting } from "./calendar-slots";
import { classifyMeeting, type AttendeeLookup } from "./meeting-classifier";

export type TaskType = "deep_work" | "follow_up" | "prep" | "decision" | "admin";

export type Candidate = {
  /** Specific action sentence. Not vague. */
  title: string;
  entity_type: "loop" | "opportunity" | "project" | "meeting_prep" | "meeting_follow_up";
  entity_id: string;
  entity_label: string;
  duration_min: number;
  task_type: TaskType;
  urgency_score: number;      // 0-100
  confidence_score: number;   // 0-100 — how confident we are the title is real and specific
  why_now: string;
  expected_outcome: string;
  /** Stable de-dup key. */
  fingerprint: string;
  /** If set, the assigned slot must satisfy this window. Used for prep/follow-up. */
  hard_time_constraint?: { kind: "before" | "after"; reference: Date; withinMs: number };
};

// ─── Loops → Candidates ──────────────────────────────────────────────────────

type LoopRow = {
  id: string;
  title: string;
  loop_type: string;
  status: string;
  priority_score: number;
  founder_owned: boolean;
  due_at: string | null;
  linked_entity_type: string;
  linked_entity_id: string;
  linked_entity_name: string;
  review_url: string | null;
  intervention_moment: string;
};

function loopDuration(loopType: string): number {
  switch (loopType) {
    case "blocker":     return 60;
    case "decision":    return 45;
    case "review":      return 60;
    case "prep":        return 45;
    case "commitment":  return 60;
    case "follow_up":   return 30;
    default:            return 45;
  }
}

function loopTaskType(loopType: string): TaskType {
  switch (loopType) {
    case "blocker":     return "deep_work";
    case "decision":    return "decision";
    case "review":      return "deep_work";
    case "prep":        return "prep";
    case "commitment":  return "deep_work";
    case "follow_up":   return "follow_up";
    default:            return "admin";
  }
}

function loopWhyNow(l: LoopRow, dueSoonDays: number | null): string {
  const reasons: string[] = [];
  if (l.intervention_moment === "urgent") reasons.push("Marked urgent");
  if (l.founder_owned) reasons.push("You own this directly");
  if (dueSoonDays !== null && dueSoonDays <= 0) reasons.push("Past due");
  else if (dueSoonDays !== null && dueSoonDays <= 2) reasons.push(`Due in ${dueSoonDays} day${dueSoonDays === 1 ? "" : "s"}`);
  else if (dueSoonDays !== null && dueSoonDays <= 7) reasons.push("Due this week");
  if (l.loop_type === "blocker")  reasons.push(`Unblocks ${l.linked_entity_name}`);
  if (l.loop_type === "decision") reasons.push(`${l.linked_entity_name} waiting on the call`);
  if (reasons.length === 0) reasons.push(`Top-scored loop (priority ${l.priority_score}/100)`);
  return reasons.slice(0, 2).join(" · ") + ".";
}

function loopExpectedOutcome(l: LoopRow): string {
  switch (l.loop_type) {
    case "blocker":    return `${l.linked_entity_name}: unblocked next step decided and written down.`;
    case "decision":   return `Decision recorded in Notion and communicated to ${l.linked_entity_name}.`;
    case "review":     return `Document reviewed; approve / changes / reject recorded.`;
    case "prep":       return `Meeting prep brief drafted: agenda + open questions + desired outcome.`;
    case "commitment": return `Committed deliverable sent to ${l.linked_entity_name}.`;
    case "follow_up":  return `Reply sent on the ${l.linked_entity_name} thread.`;
    default:           return `Loop closed in Notion with a concrete next step.`;
  }
}

function loopTitle(l: LoopRow): string {
  // The loop title is already specific for most loop_types. Prefix with a verb
  // where it clarifies intent.
  const t = l.title.trim();
  switch (l.loop_type) {
    case "blocker":    return t.startsWith("Blocker") ? t : `Unblock — ${t}`;
    case "decision":   return t.startsWith("Decide")  || t.startsWith("Decision") ? t : `Decide — ${t}`;
    case "review":     return t.startsWith("Review")  ? t : `Review — ${t}`;
    case "prep":       return t.startsWith("Prep")    ? t : `Prep — ${t}`;
    case "commitment": return t.startsWith("Deliver") ? t : `Deliver — ${t}`;
    case "follow_up":  return t.startsWith("Reply")   || t.startsWith("Follow") ? t : `Follow up — ${t}`;
    default:           return t;
  }
}

export async function candidatesFromLoops(limit = 20): Promise<Candidate[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("loops")
    .select("id,title,loop_type,status,priority_score,founder_owned,due_at,linked_entity_type,linked_entity_id,linked_entity_name,review_url,intervention_moment")
    .in("status", ["open", "in_progress", "reopened"])
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];

  // Grant activation gate: drop any loop whose linked opportunity is an
  // unfollowed grant. Belt-and-suspenders vs. stale loops left from a time
  // the grant was followed, or created by legacy paths.
  const oppIds = [...new Set(
    (data as LoopRow[])
      .filter(l => l.linked_entity_type === "opportunity")
      .map(l => l.linked_entity_id)
      .filter(Boolean),
  )];
  const unfollowedGrantIds = new Set<string>();
  if (oppIds.length > 0) {
    const { data: opps } = await sb
      .from("opportunities")
      .select("notion_id,opportunity_type,is_followed")
      .in("notion_id", oppIds);
    for (const o of (opps ?? []) as { notion_id: string; opportunity_type: string | null; is_followed: boolean | null }[]) {
      if (o.opportunity_type === "Grant" && o.is_followed !== true) {
        unfollowedGrantIds.add(o.notion_id);
      }
    }
  }

  const now = Date.now();
  const out: Candidate[] = [];
  for (const l of data as LoopRow[]) {
    // Titles that are clearly non-specific get filtered out.
    if (!l.title || l.title.trim().length < 6) continue;
    if (l.linked_entity_type === "opportunity" && unfollowedGrantIds.has(l.linked_entity_id)) continue;

    const dueSoonDays = l.due_at
      ? Math.floor((new Date(l.due_at).getTime() - now) / 86_400_000)
      : null;
    const urgencyBoost =
      (l.intervention_moment === "urgent" ? 15 : 0) +
      (dueSoonDays !== null && dueSoonDays <= 0 ? 20 : 0) +
      (dueSoonDays !== null && dueSoonDays <= 2 ? 10 : 0);
    const urgency = Math.min(100, l.priority_score + urgencyBoost);

    out.push({
      title:            loopTitle(l),
      entity_type:      "loop",
      entity_id:        l.id,
      entity_label:     l.linked_entity_name,
      duration_min:     loopDuration(l.loop_type),
      task_type:        loopTaskType(l.loop_type),
      urgency_score:    urgency,
      confidence_score: l.priority_score >= 60 ? 85 : 70,
      why_now:          loopWhyNow(l, dueSoonDays),
      expected_outcome: loopExpectedOutcome(l),
      fingerprint:      `loop:${l.id}:${loopTaskType(l.loop_type)}`,
    });
  }
  return out;
}

// ─── Opportunities → Candidates ──────────────────────────────────────────────

type OppRow = {
  notion_id: string;
  title: string;
  org_name: string | null;
  suggested_next_step: string | null;
  opportunity_score: number | null;
  follow_up_status: string | null;
  qualification_status: string | null;
  status: string | null;
  opportunity_type: string | null;
  is_followed: boolean | null;
};

export async function candidatesFromOpportunities(
  coveredByLoop: Set<string>,
  limit = 15,
): Promise<Candidate[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select("notion_id,title,org_name,suggested_next_step,opportunity_score,follow_up_status,qualification_status,status,opportunity_type,is_followed")
    .eq("is_legacy",   false)
    .eq("is_archived", false)
    .eq("is_active",   true)
    .gte("opportunity_score", 60)
    .order("opportunity_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];

  const out: Candidate[] = [];
  for (const o of data as OppRow[]) {
    if (coveredByLoop.has(o.notion_id)) continue;
    // Grant activation gate: grants must be explicitly Followed by a human.
    // System score alone must NOT push a grant into Suggested Time Blocks.
    if (o.opportunity_type === "Grant" && o.is_followed !== true) continue;
    const step = (o.suggested_next_step ?? "").trim();
    if (!step || step.length < 12) continue;                 // require specificity

    const urgency = Math.min(100, (o.opportunity_score ?? 0) + (o.follow_up_status === "Needed" ? 15 : 0));

    out.push({
      title:            `${step.replace(/\.$/, "")} — ${o.org_name ?? o.title}`,
      entity_type:      "opportunity",
      entity_id:        o.notion_id,
      entity_label:     o.org_name ?? o.title,
      duration_min:     step.length > 80 ? 60 : 45,
      task_type:        "deep_work",
      urgency_score:    urgency,
      confidence_score: 75,
      why_now:          `Active opportunity (score ${o.opportunity_score ?? "—"}/100)${o.follow_up_status === "Needed" ? " · follow-up flagged" : ""}.`,
      expected_outcome: `Next step executed: ${step.length > 140 ? step.slice(0, 140) + "…" : step}`,
      fingerprint:      `opportunity:${o.notion_id}:deep_work`,
    });
  }
  return out;
}

// ─── Meetings → Prep + Follow-up Candidates ─────────────────────────────────

/**
 * Signal gate: for each attendee email, returns whether the counterpart has
 * enough historical signal that a prep brief would produce something useful.
 * Bar is intentionally low — we only want to suppress the "total strangers
 * with 2 emails" case. Passing the gate doesn't guarantee a great brief, it
 * guarantees it won't be generic.
 *
 * Pass conditions (ANY one is enough):
 *   - person_classification = Internal (founders, team — always prep-worthy)
 *   - contact_warmth = Hot or Warm
 *   - At least 1 WhatsApp message exists in conversation_messages FK'd to
 *     this person_id
 *
 * Fail: external contact with no WA history, no warmth mark, not internal.
 */
async function counterpartsWithPrepSignal(emails: string[]): Promise<Set<string>> {
  const ok = new Set<string>();
  if (emails.length === 0) return ok;
  const sb = getSupabaseServerClient();
  const lowerEmails = emails.map(e => e.toLowerCase());

  // Single-table query against unified `people`. Pass conditions (any):
  //   - Meaningful relationship_class / relationship_classes (human-classified
  //     Partner/Investor/Client/Team/Portfolio/Funder/Vendor/VIP)
  //   - Hot or Warm warmth
  //   - Legacy Internal classification (pre-migration)
  //   - Whatsapp messages linked to this person (sender_person_id)
  const { data: people } = await sb
    .from("people")
    .select("id, email, person_classification, contact_warmth, relationship_class, relationship_classes")
    .in("email", lowerEmails);

  const MEANINGFUL = new Set(["partner", "investor", "funder", "client", "portfolio", "vendor", "team", "vip"]);
  const personIdByEmail = new Map<string, string>();
  for (const p of (people ?? []) as Array<{
    id: string;
    email: string | null;
    person_classification: string | null;
    contact_warmth:        string | null;
    relationship_class:    string | null;
    relationship_classes:  string[] | null;
  }>) {
    const em = (p.email ?? "").toLowerCase();
    if (!em) continue;
    personIdByEmail.set(em, p.id);

    const cls       = (p.person_classification ?? "").toLowerCase();
    const warmth    = (p.contact_warmth ?? "").toLowerCase();
    const primary   = (p.relationship_class ?? "").toLowerCase();
    const allClasses = (p.relationship_classes ?? []).map(c => (c ?? "").toLowerCase());
    const hasMeaningfulClass = [primary, ...allClasses].some(c => MEANINGFUL.has(c));

    if (cls === "internal" || warmth === "hot" || warmth === "warm" || hasMeaningfulClass) {
      ok.add(em);
    }
  }

  // Secondary pass: WhatsApp FK. A person with linked WA messages has
  // substantive signal regardless of classification.
  const idsToCheck = [...personIdByEmail.entries()]
    .filter(([em]) => !ok.has(em))
    .map(([, id]) => id);
  if (idsToCheck.length > 0) {
    const { data: waLinked } = await sb
      .from("conversation_messages")
      .select("sender_person_id")
      .eq("platform", "whatsapp")
      .in("sender_person_id", idsToCheck)
      .limit(idsToCheck.length * 2);
    const linkedIds = new Set(
      (waLinked ?? []).map(r => (r as { sender_person_id: string | null }).sender_person_id).filter(Boolean) as string[]
    );
    for (const [em, id] of personIdByEmail.entries()) {
      if (linkedIds.has(id)) ok.add(em);
    }
  }

  return ok;
}

export async function candidatesFromMeetings(
  meetings: UpcomingMeeting[],
  now: Date,
  lookup: AttendeeLookup = new Map(),
): Promise<Candidate[]> {
  const out: Candidate[] = [];

  // Pre-compute prep-signal gate for all non-self attendees across all meetings
  // in one batch, so we don't make per-meeting DB calls.
  const allAttendeeEmails = new Set<string>();
  for (const m of meetings) {
    for (const a of m.attendees) {
      if (!a.self && a.email) allAttendeeEmails.add(a.email.toLowerCase());
    }
  }
  const prepWorthy = await counterpartsWithPrepSignal([...allAttendeeEmails]);

  for (const m of meetings) {
    const msUntil = m.start.getTime() - now.getTime();
    const daysUntil = msUntil / 86_400_000;
    if (msUntil <= 0) continue;                                // only upcoming
    if (daysUntil > 7) continue;

    const cls = classifyMeeting(m, lookup);

    // is_personal = every non-self attendee is Family/Personal Service/Friend.
    // Skip prep entirely — the event stays busy on the calendar for slot
    // finding, but no prep/follow-up task is emitted.
    if (cls.is_personal) continue;

    // Context gate: prep only makes sense when there is something to prepare
    // from. Skip prep when the meeting has no agenda/description AND is not
    // high-stakes (no VIP) AND is a small invite list. Solo calls, quick 1:1s
    // with no notes, and generic catch-ups do not benefit from a prep block.
    const hasDescription    = (m.description ?? "").length >= 30;
    const isMultiParty      = cls.confirmed_count + cls.tentative_count >= 3;
    const hasContext        = hasDescription || cls.has_vip || isMultiParty;

    // Signal gate: pass if EITHER at least one non-self attendee passes the
    // contact-signal check (they're Internal / Warm+ / have WA linked) OR
    // the meeting itself carries strong context (long description, VIP, or
    // a multi-party coordination). The second path avoids over-suppressing
    // real high-stakes meetings where attendees simply aren't populated in
    // the people table yet (a common state for external partners).
    const nonSelf         = m.attendees.filter(a => !a.self && a.email);
    const hasContactSignal = nonSelf.some(a => prepWorthy.has(a.email.toLowerCase()));
    const strongContext    = (m.description ?? "").length >= 200
                             || cls.has_vip
                             || cls.confirmed_count >= 3;
    const hasSignal        = hasContactSignal || strongContext;

    // Prep candidate: needed if meeting is in next 3 days, has attendees, AND
    // we actually have signal on at least one of them.
    if (daysUntil <= 3 && hasContext && hasSignal) {
      // VIP boost: any non-self attendee in Investor / Funder / Portfolio
      const baseUrgency = daysUntil <= 1 ? 85 : 70;
      const vipBoost    = cls.has_vip ? 15 : 0;
      // Attendee-confirmation weighting: heavier signal when most attendees have
      // already accepted. Raw count scales slightly so big confirmed meetings win.
      const confirmBoost = Math.min(5, cls.confirmed_count);
      const urgency = Math.min(100, baseUrgency + vipBoost + confirmBoost);

      const whyParts: string[] = [
        `Meeting ${new Intl.DateTimeFormat("en-GB", { timeZone: "America/Costa_Rica", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(m.start)}`,
        `${cls.confirmed_count} confirmed${cls.tentative_count ? ` + ${cls.tentative_count} tentative` : ""}`,
      ];
      if (cls.has_vip) whyParts.push("VIP attendee — high-stakes");

      out.push({
        title:            `Prep for "${m.title}"`,
        entity_type:      "meeting_prep",
        entity_id:        m.id,
        entity_label:     m.title,
        duration_min:     45,
        task_type:        "prep",
        urgency_score:    urgency,
        confidence_score: 80,
        why_now:          whyParts.join(" · ") + ".",
        expected_outcome: `Review open commitments with counterpart; walk in with prep actions decided.`,
        fingerprint:      `meeting_prep:${m.id}:prep`,
        hard_time_constraint: { kind: "before", reference: m.start, withinMs: 24 * 3600_000 },
      });
    }
  }
  return out;
}

export function candidatesFromRecentMeetings(
  recentMeetings: UpcomingMeeting[],
  now: Date,
  lookup: AttendeeLookup = new Map(),
): Candidate[] {
  // "recent" = ended in the last 24 hours
  const out: Candidate[] = [];
  for (const m of recentMeetings) {
    const endedAgoMs = now.getTime() - m.end.getTime();
    if (endedAgoMs < 0 || endedAgoMs > 24 * 3600_000) continue;
    // Skip personal meetings — never queue a follow-up for a therapy
    // appointment, family dinner, etc.
    const cls = classifyMeeting(m, lookup);
    if (cls.is_personal) continue;
    out.push({
      title:            `Follow up on "${m.title}"`,
      entity_type:      "meeting_follow_up",
      entity_id:        m.id,
      entity_label:     m.title,
      duration_min:     30,
      task_type:        "follow_up",
      urgency_score:    80,
      confidence_score: 70,
      why_now:          `Meeting ended ${Math.round(endedAgoMs / 3600_000)}h ago — follow-up decays fast.`,
      expected_outcome: `Action items confirmed; one follow-up email sent to ${m.attendeeCount} attendee${m.attendeeCount === 1 ? "" : "s"}.`,
      fingerprint:      `meeting_follow_up:${m.id}:follow_up`,
      hard_time_constraint: { kind: "after", reference: m.end, withinMs: 48 * 3600_000 },
    });
  }
  return out;
}

/** Entity ids covered by existing loops so opportunities don't duplicate. */
export async function loopCoveredEntityIds(): Promise<Set<string>> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("loops")
    .select("linked_entity_id,linked_entity_type,status")
    .in("status", ["open", "in_progress", "reopened"]);
  const out = new Set<string>();
  for (const r of (data ?? []) as { linked_entity_id: string }[]) {
    if (r.linked_entity_id) out.add(r.linked_entity_id);
  }
  return out;
}

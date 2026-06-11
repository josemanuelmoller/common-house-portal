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
import type { Effort } from "./ingestors/types";

export type TaskType = "deep_work" | "follow_up" | "prep" | "decision" | "admin" | "commitment";

export type Candidate = {
  /** Specific action sentence. Not vague. */
  title: string;
  entity_type: "loop" | "opportunity" | "project" | "meeting_prep" | "meeting_follow_up" | "commitment" | "quick_batch";
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
  /** Hints for resolveProjectContexts — explicit FK ids when the source row
   *  carries them, free text for conservative name inference otherwise. */
  project_ref?: {
    project_id?: string | null;
    objective_id?: string | null;
    name_hint?: string | null;
    infer_text?: string | null;
  };
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
  parent_project_name: string | null;
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
    .select("id,title,loop_type,status,priority_score,founder_owned,due_at,linked_entity_type,linked_entity_id,linked_entity_name,review_url,intervention_moment,parent_project_name")
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
      project_ref:      {
        name_hint:  l.parent_project_name,
        infer_text: `${l.title} ${l.linked_entity_name}`,
      },
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
      project_ref:      { infer_text: `${o.title} ${o.org_name ?? ""}` },
    });
  }
  return out;
}

// ─── Open Commitments → Candidates ──────────────────────────────────────────
//
// The intelligence core of Suggested Time Blocks v2. A block is suggested only
// when a real, content-derived commitment (extracted from meeting transcripts
// / email by the ingestors into `action_items`) needs a dedicated work
// session. Three tests gate every candidate:
//   1. Effort   — the work itself needs a session (effort='session'), or a
//                 focused slot under concrete pressure (effort='focused').
//   2. Window   — an open calendar slot fits it (enforced by the matcher).
//   3. Pressure — deadline / accountability meeting / staleness shape urgency.
// Quick items (≤15 min) never earn an individual block: they are dispatched
// from the Inbox / Commitments ledger, or swept by ONE batch block when they
// accumulate (see quickBatchCandidate). A meeting with no extracted
// commitments produces NO block — the empty state is the correct output.

export type CommitmentRow = {
  id:                string;
  subject:           string;
  counterparty:      string | null;
  next_action:       string | null;
  intent:            string;
  effort:            string | null;
  deadline:          string | null;
  priority_score:    number;
  last_motion_at:    string;
  first_surfaced_at: string | null;
  source_type:       string;
  source_url:        string | null;
  project_id:        string | null;
  strategic_objective_id: string | null;
};

/** Intents that can justify an individual time block. `reply` belongs to the
 *  Inbox, `prep` to the meeting-prep generator, `chase`/`nurture` are quick
 *  by nature (a nudge is a message, not a session). */
const BLOCK_INTENTS = new Set(["deliver", "decide", "approve", "review"]);

/** Verbs/nouns that signal the next action produces an artifact. */
const PRODUCTION_RE = /(document|draft|write|prepare|create|build|design|develop|finali[sz]e|set up|structure|plan|proposal|deck|presentation|report|agreement|contract|budget|model|analysis|spreadsheet|tracking|system|documentar|redactar|preparar|crear|propuesta|informe|acuerdo|presupuesto)/i;

/** Fallback when action_items.effort is NULL (rows older than the classifier,
 *  or sources without one). Mirrors the SQL backfill heuristic. */
export function inferEffort(intent: string, text: string): Effort {
  if (["chase", "reply", "nurture", "close_loop", "follow_up"].includes(intent)) return "quick";
  if (["decide", "approve", "review", "prep"].includes(intent)) return "focused";
  if (intent === "deliver") return PRODUCTION_RE.test(text) ? "session" : "focused";
  return "focused";
}

function effortOf(r: CommitmentRow): Effort {
  if (r.effort === "quick" || r.effort === "focused" || r.effort === "session") return r.effort;
  return inferEffort(r.intent, `${r.next_action ?? ""} ${r.subject}`);
}

/**
 * Open commitments owned by Jose, from content-bearing sources.
 * `loops` is intentionally excluded — candidatesFromLoops reads the loops
 * table directly with richer loop-type logic; including the mirrored
 * action_items rows would double-surface the same work.
 */
export async function fetchOpenCommitmentRows(limit = 50): Promise<CommitmentRow[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("action_items")
    .select("id, subject, counterparty, next_action, intent, effort, deadline, priority_score, last_motion_at, first_surfaced_at, source_type, source_url, project_id, strategic_objective_id")
    .eq("status", "open")
    .eq("ball_in_court", "jose")
    .in("source_type", ["fireflies", "gmail", "drive", "evidence_derived"])
    .in("intent", ["deliver", "decide", "approve", "review", "chase", "follow_up", "close_loop"])
    .order("priority_score", { ascending: false })
    .order("last_motion_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as CommitmentRow[];
}

/** Accent-insensitive tokens, ≥3 chars, for name/title matching. */
function normTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

/**
 * Does this commitment involve this meeting? True when the counterparty name
 * matches an attendee (display name or email local part) or the meeting
 * title, or when the meeting title overlaps the commitment subject on ≥2
 * meaningful tokens (catches org/project-named meetings).
 *
 * Exported for meeting-retomas, which uses the SAME matcher so the
 * prep-vs-retoma split can never disagree about whether something is owed.
 */
export function commitmentMatchesMeeting(r: CommitmentRow, m: UpcomingMeeting): boolean {
  const cpTokens = normTokens(r.counterparty);
  const titleTokens = normTokens(m.title);
  const titleSet = new Set(titleTokens);

  if (cpTokens.length > 0) {
    for (const a of m.attendees) {
      if (a.self) continue;
      const hay = new Set(normTokens(`${a.displayName ?? ""} ${a.email.split("@")[0].replace(/[._-]/g, " ")}`));
      if (cpTokens.some(t => hay.has(t))) return true;
    }
    if (cpTokens.some(t => titleSet.has(t))) return true;
  }

  const subjSet = new Set(normTokens(r.subject));
  const overlap = titleTokens.filter(t => subjSet.has(t)).length;
  return overlap >= 2;
}

/** Earliest upcoming meeting (≤7d) where this commitment will be on the table. */
function findAccountabilityMeeting(
  r: CommitmentRow,
  meetings: UpcomingMeeting[],
  now: Date,
): UpcomingMeeting | null {
  const sorted = [...meetings].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const m of sorted) {
    const msUntil = m.start.getTime() - now.getTime();
    if (msUntil <= 0 || msUntil > 7 * 86_400_000) continue;
    if (commitmentMatchesMeeting(r, m)) return m;
  }
  return null;
}

function fmtMeetingTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

function commitmentOutcome(r: CommitmentRow): string {
  const to = r.counterparty ? ` and sent to ${r.counterparty}` : "";
  switch (r.intent) {
    case "decide":
    case "approve": return `Decision made${r.counterparty ? ` and communicated to ${r.counterparty}` : " and recorded"}.`;
    case "review":  return `Reviewed; verdict${to || " recorded"}.`;
    default:        return `Deliverable produced${to} — commitment closed.`;
  }
}

export function candidatesFromCommitments(
  rows: CommitmentRow[],
  upcomingMeetings: UpcomingMeeting[],
  now: Date,
  tz: string,
): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    if (!BLOCK_INTENTS.has(r.intent)) continue;
    const effort = effortOf(r);
    if (effort === "quick") continue;                            // Test 1 fail

    const sinceIso = r.first_surfaced_at ?? r.last_motion_at;
    const daysOpen = Math.max(0, Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 86_400_000));
    const deadlineDays = r.deadline
      ? Math.floor((new Date(r.deadline).getTime() - now.getTime()) / 86_400_000)
      : null;
    const meeting = findAccountabilityMeeting(r, upcomingMeetings, now);
    const meetingDays = meeting ? (meeting.start.getTime() - now.getTime()) / 86_400_000 : null;

    // Test 3 gate for focused work: a 30-60 min task earns a block only under
    // concrete pressure. Session work earns one by its size alone.
    const hasPressure =
      (deadlineDays !== null && deadlineDays <= 10) ||
      meeting !== null ||
      daysOpen >= 10;
    if (effort === "focused" && !hasPressure) continue;

    let urgency = Math.min(70, Math.max(35, r.priority_score));
    if (deadlineDays !== null) {
      if (deadlineDays < 0)       urgency += 25;
      else if (deadlineDays <= 2) urgency += 20;
      else if (deadlineDays <= 7) urgency += 12;
    }
    if (meetingDays !== null) urgency += meetingDays <= 3 ? 15 : 8;
    urgency = Math.min(100, urgency + Math.min(12, Math.floor(daysOpen / 7) * 4));

    // Evidence quality: transcript/evidence-derived items beat heuristics.
    let confidence = r.source_type === "fireflies" || r.source_type === "evidence_derived" ? 80 : 70;
    if (!r.effort) confidence -= 10;                             // effort was inferred

    const why: string[] = [];
    why.push(daysOpen <= 0 ? "Committed today" : daysOpen === 1 ? "Committed yesterday" : `Open commitment for ${daysOpen}d`);
    if (deadlineDays !== null) {
      why.push(
        deadlineDays < 0 ? `${-deadlineDays}d past due`
        : deadlineDays === 0 ? "due today"
        : `due in ${deadlineDays}d`,
      );
    }
    if (meeting) why.push(`you meet ${r.counterparty ?? "them"} ${fmtMeetingTime(meeting.start, tz)}`);
    if (deadlineDays === null && !meeting) {
      why.push(effort === "session" ? "needs a dedicated work session" : "aging — schedule it or drop it");
    }

    const title = (r.next_action ?? r.subject).trim();
    const label = r.counterparty && r.subject.trim() !== title
      ? `${r.counterparty} · ${r.subject}`
      : (r.counterparty ?? r.subject);

    out.push({
      title,
      entity_type:      "commitment",
      entity_id:        r.id,
      entity_label:     label,
      duration_min:     effort === "session" ? 90 : 45,
      task_type:        "commitment",
      urgency_score:    urgency,
      confidence_score: confidence,
      why_now:          why.join(" · ") + ".",
      expected_outcome: commitmentOutcome(r),
      fingerprint:      `commitment:${r.id}`,
      project_ref:      {
        project_id:   r.project_id,
        objective_id: r.strategic_objective_id,
        infer_text:   `${r.subject} ${r.next_action ?? ""} ${r.counterparty ?? ""}`,
      },
      // Bind to "before the accountability meeting" only when there is enough
      // room to actually find a slot; binding a meeting <48h out would drop
      // the candidate entirely whenever the day is already packed.
      ...(meeting && meetingDays !== null && meetingDays >= 2
        ? { hard_time_constraint: { kind: "before" as const, reference: meeting.start, withinMs: meeting.start.getTime() - now.getTime() } }
        : {}),
    });
  }
  return out;
}

/**
 * One aggregated block when quick items pile up. Individually none of them
 * deserves calendar time (each is ≤15 min); collectively the backlog does.
 * Never more than one such block; below the threshold, quick items live only
 * in the Commitments ledger / Inbox.
 */
export function quickBatchCandidate(rows: CommitmentRow[]): Candidate | null {
  const quick = rows.filter(r => r.intent !== "reply" && effortOf(r) === "quick");
  if (quick.length < 4) return null;

  const names = [...new Set(quick.map(r => (r.counterparty ?? "").trim().split(/\s+/)[0]).filter(Boolean))];
  const preview = names.slice(0, 3).join(", ");
  const n = quick.length;

  return {
    title:            `Batch-clear ${n} quick pendings`,
    entity_type:      "quick_batch",
    entity_id:        "quick_batch",
    entity_label:     `${n} items${preview ? ` · ${preview}${names.length > 3 ? ` +${names.length - 3}` : ""}` : ""}`,
    duration_min:     n >= 8 ? 45 : 30,
    task_type:        "admin",
    urgency_score:    Math.min(75, 50 + n * 2),
    confidence_score: 75,
    why_now:          `${n} sub-15-min items accumulated (nudges, confirmations, short replies) — one sweep clears them all.`,
    expected_outcome: `Each quick item actioned: short message sent or marked done in the Commitments ledger.`,
    fingerprint:      "quick_batch:admin",
  };
}

// ─── Meetings → Prep Candidates ──────────────────────────────────────────────

/** Recurring Google Calendar instances carry ids like `<seriesId>_<timestamp>`.
 *  Fingerprinting on the series id makes a dismissal cover the whole series
 *  (this week's dismissed weekly prep doesn't respawn next week). */
function seriesKey(eventId: string): string {
  return eventId.split("_")[0];
}

/** A description counts as a real agenda only after stripping HTML and URLs
 *  (a bare Zoom link is not an agenda). Bullet/numbered lines count even
 *  when short. */
function hasRealAgenda(desc: string | null | undefined): boolean {
  const raw = desc ?? "";
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length >= 120) return true;
  const lines = raw.split(/\r?\n/).map(l => l.trim());
  return lines.filter(l => /^([-*•·]|\d+[.)])\s+\S/.test(l)).length >= 2;
}

export type PrepOptions = {
  timezone: string;
  /** Open commitments (fetchOpenCommitmentRows) — material gate A. */
  openCommitments: CommitmentRow[];
};

/**
 * Prep candidates — emitted ONLY when Jose walks in owing the meeting
 * something concrete: an open commitment involving an attendee or this
 * meeting's subject. Owed work is the one honest reason to reserve
 * calendar time, because it is the only case where there is both material
 * to prepare FROM and an output of Jose's to prepare.
 *
 * An agenda alone or a VIP attendee does NOT create a block any more:
 * with no task of Jose's there is nothing to prepare, and the old blocks
 * degenerated into generic filler ("Agenda reviewed; a position decided").
 * Those meetings get a Retoma card next to the day's agenda instead
 * (src/lib/meeting-retomas.ts) — a read-before-you-walk-in pointer that
 * costs zero calendar time. Agenda and VIP survive only as boosters on
 * blocks that earned their place through owed work.
 */
export function candidatesFromMeetings(
  meetings: UpcomingMeeting[],
  now: Date,
  lookup: AttendeeLookup = new Map(),
  opts: PrepOptions,
): Candidate[] {
  const out: Candidate[] = [];

  for (const m of meetings) {
    const msUntil = m.start.getTime() - now.getTime();
    const daysUntil = msUntil / 86_400_000;
    if (msUntil <= 0 || daysUntil > 3) continue;

    const cls = classifyMeeting(m, lookup);
    // is_personal = every non-self attendee is Family/Personal Service/Friend.
    // The event stays busy for slot-finding, but no prep task is emitted.
    if (cls.is_personal) continue;

    const owed = opts.openCommitments.filter(r => commitmentMatchesMeeting(r, m));
    if (owed.length === 0) continue;             // nothing owed → no prep block

    const agenda = hasRealAgenda(m.description); // booster, never a gate
    const vip    = cls.has_vip;                  // booster, never a gate

    const timeLabel = fmtMeetingTime(m.start, opts.timezone);
    const whyParts: string[] = [];
    let urgency = (daysUntil <= 1 ? 75 : 62) + 12;

    const first = owed[0];
    const firstTitle = (first.next_action ?? first.subject).trim();
    const shortTitle = firstTitle.length > 60 ? firstTitle.slice(0, 57) + "…" : firstTitle;
    whyParts.push(`Open with ${first.counterparty ?? "the counterpart"}: "${shortTitle}"${owed.length > 1 ? ` +${owed.length - 1} more` : ""}`);
    if (agenda) whyParts.push("agenda set");
    if (vip)    { whyParts.push("VIP attendee — high stakes"); urgency += 8; }
    whyParts.push(`meeting ${timeLabel} · ${cls.confirmed_count} confirmed`);

    out.push({
      title:            `Prep for "${m.title}"`,
      entity_type:      "meeting_prep",
      entity_id:        m.id,
      entity_label:     m.title,
      duration_min:     owed.length >= 2 || agenda ? 45 : 40,
      task_type:        "prep",
      urgency_score:    Math.min(100, urgency),
      confidence_score: 85,
      why_now:          whyParts.join(" · ") + ".",
      expected_outcome: `Walk in with the ${owed.length} open item${owed.length === 1 ? "" : "s"} addressed or an answer ready.`,
      fingerprint:      `meeting_prep:${seriesKey(m.id)}:prep`,
      hard_time_constraint: { kind: "before", reference: m.start, withinMs: 24 * 3600_000 },
      project_ref:      {
        project_id: first.project_id,
        objective_id: first.strategic_objective_id,
        infer_text: `${m.title} ${first.subject}`,
      },
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

// ─── Dismissal feedback loop ─────────────────────────────────────────────────

/**
 * Per-task-type confidence penalty learned from Jose's own dismissals.
 * If a block type gets dismissed most of the time over the last 30 days
 * (minimum 5 decisions so one bad week doesn't swing it), its candidates
 * lose up to 20 confidence points — chronically rejected types sink below
 * the matcher's confidence floor on their own, without a human retuning
 * weights. Accepting blocks of that type heals the penalty symmetrically.
 */
export async function fetchTaskTypeDismissPenalties(
  userEmail: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const sb = getSupabaseServerClient();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await sb
      .from("suggested_time_blocks")
      .select("task_type, status")
      .eq("user_email", userEmail)
      .in("status", ["dismissed", "accepted"])
      .gte("generated_at", since)
      .limit(500);
    const stats = new Map<string, { dismissed: number; total: number }>();
    for (const r of (data ?? []) as Array<{ task_type: string; status: string }>) {
      const s = stats.get(r.task_type) ?? { dismissed: 0, total: 0 };
      s.total++;
      if (r.status === "dismissed") s.dismissed++;
      stats.set(r.task_type, s);
    }
    for (const [taskType, s] of stats.entries()) {
      if (s.total < 5) continue;                      // not enough signal yet
      const rate = s.dismissed / s.total;
      if (rate >= 0.5) out[taskType] = Math.round(rate * 20);
    }
  } catch {
    // Feedback is an optimization — never let it break generation.
  }
  return out;
}

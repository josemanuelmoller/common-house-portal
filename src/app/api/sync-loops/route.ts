/**
 * POST /api/sync-loops  [Loop Engine v1]
 *
 * Loop Engine sync — reads from three Notion sources and upserts into the
 * Supabase `loops` + `loop_signals` tables.
 *
 * Sources (v1):
 *   1. CH Evidence [OS v2]   — Validated Blockers (30d) + Commitments (14d)
 *   2. Opportunities [OS v2] — Active/Qualifying/New with explicit signals
 *   3. CH Projects [OS v2]   — Active, "Project Update Needed?" = true
 *
 * Rules enforced:
 *   - A meeting alone never creates a loop (must have pending action or status)
 *   - A stale record alone never creates a loop
 *   - Grant opportunity pending actions are sourcing context, not tasks
 *   - Resolved/dismissed loops are re-opened only when a new signal arrives
 *   - Priority score is recomputed on every sync
 *
 * Auth: CRON_SECRET or x-agent-key header.
 * Cron: every 30 min — "* /30 * * * *" in vercel.json (spaces added here to avoid closing comment)
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  buildNormalizedKey,
  buildIntentKey,
  classifyOpportunityLoop,
  computePriorityScore,
  isActionablePendingAction,
  isGrant,
  isMateriallyNewEvidence,
  isPassiveDiscovery,
  normalizeFingerprint,
  type Loop,
  type LoopType,
  type NormalizedKeyVariant,
  type SignalType,
} from "@/lib/loops";

export const maxDuration = 60;

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── DB IDs (copied from notion/core.ts to avoid circular imports) ─────────────
const DB = {
  evidence:      "fa28124978d043039d8932ac9964ccf5",
  opportunities: "687caa98594a41b595c9960c141be0c0",
  projects:      "49d59b18095f46588960f2e717832c5f",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey  === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`)  return true;
  if (agentKey === "ch-os-agent-2024-secure")          return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function text(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title")     return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  return "";
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sel(prop: any): string  { return prop?.select?.name ?? ""; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dt(prop: any): string | null { return prop?.date?.start ?? null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chk(prop: any): boolean { return prop?.checkbox ?? false; }

// ─── Track F: Founder-owned entity detection ──────────────────────────────────
//
// Hardcoded map of strategic tracks that Jose leads directly.
// Matched against entity names at sync time; matched loops get +20 score bonus.
// Extend this list as new strategic areas are confirmed.

const FOUNDER_OWNED_PATTERNS: RegExp[] = [
  /\bcop\s*31\b/i,                    // COP31 project
  /zero\s*waste\s*forum/i,            // Zero Waste Forum
  /\bzwf\b/i,                         // ZWF Forum 2026
  /zero\s*waste\s*districts?/i,       // Zero Waste Districts (+ Malaysia)
  /china\s*zero\s*waste/i,            // China Zero Waste
  /egypt.*reuse|reuse.*egypt/i,       // Egypt Program Reuse
  /reuse\s*for\s*all/i,               // Reuse for All project
];

function isFounderOwned(entityName: string): boolean {
  return FOUNDER_OWNED_PATTERNS.some(p => p.test(entityName));
}

// ─── Operator actionability filter ───────────────────────────────────────────
//
// Returns false if the evidence title or excerpt clearly assigns the action
// to someone OTHER than the operator (Jose / Jose Manuel). Typical pattern:
// "[Name] to [verb]" — e.g. "Neil to follow up on speaker flights."
// This prevents non-actionable delegated tasks from surfacing in CoS.

const OPERATOR_NAMES = new Set(["jose", "jose manuel", "jm"]);
const ACTION_VERBS = "follow|send|confirm|schedule|review|prepare|check|book|arrange|coordinate|present|attend|reach|write|draft|submit";
const ASSIGNED_TO_PATTERN = new RegExp(`\\b([a-záéíóúñ]+)\\s+to\\s+(?:${ACTION_VERBS})`, "gi");

function isOperatorActionable(title: string, excerpt: string | null): boolean {
  const haystack = `${title} ${excerpt ?? ""}`;
  let match: RegExpExecArray | null;
  ASSIGNED_TO_PATTERN.lastIndex = 0;
  while ((match = ASSIGNED_TO_PATTERN.exec(haystack)) !== null) {
    const assignedName = match[1].toLowerCase();
    if (!OPERATOR_NAMES.has(assignedName)) {
      return false; // delegated to someone else — not Jose's direct action
    }
  }
  return true;
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

type UpsertLoopInput = Omit<Loop,
  "id" | "status" | "signal_count" | "first_seen_at" | "last_seen_at" |
  "last_action_at" | "created_at" | "updated_at" | "founder_interest" |
  "lineage_id" | "parent_loop_id" |
  "resolved_at" | "dismissed_at" | "reopened_at" | "reopen_count" |
  "last_meaningful_evidence_at" | "last_evidence_fingerprint"
> & {
  variant?: NormalizedKeyVariant | null;
};

type Stats = {
  upserted: number;
  skipped: number;
  signals_added: number;
  reopened: number;
  suppressed_reopens: number;   // matched a closed loop but evidence was NOT materially new
  errors: string[];
};

async function upsertLoop(
  input: UpsertLoopInput,
  signalType: SignalType,
  signalSourceId: string,
  signalSourceName: string,
  signalExcerpt: string | null,
  stats: Stats,
): Promise<void> {
  const sb = getSupabaseServerClient();

  try {
    // ── 1. Compute intent_key + evidence fingerprint ──────────────────────────
    const fingerprintSource = signalExcerpt || input.title || input.linked_entity_name;
    const incomingFingerprint = normalizeFingerprint(fingerprintSource);
    const intentKey = input.intent_key ?? buildIntentKey({
      entityType:  input.linked_entity_type,
      entitySlug:  input.linked_entity_name || input.linked_entity_id,
      loopType:    input.loop_type,
      variant:     input.variant ?? null,
      contentText: fingerprintSource,
    });

    // ── 2. Two-tier identity lookup ───────────────────────────────────────────
    //    (a) normalized_key (same Notion page re-synced)
    //    (b) intent_key     (same underlying issue, possibly different page)
    const { data: byNormalized } = await sb
      .from("loops")
      .select("id, status, signal_count, founder_interest, lineage_id, last_evidence_fingerprint")
      .eq("normalized_key", input.normalized_key)
      .maybeSingle();

    let existing = byNormalized;
    let matchedBy: "normalized_key" | "intent_key" | null =
      byNormalized ? "normalized_key" : null;

    if (!existing) {
      // Intent-key fallback: semantic match. Prefer active loops, then most recent.
      const { data: byIntent } = await sb
        .from("loops")
        .select("id, status, signal_count, founder_interest, lineage_id, last_evidence_fingerprint")
        .eq("intent_key", intentKey)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byIntent) {
        existing = byIntent;
        matchedBy = "intent_key";
      }
    }

    let loopId: string;

    if (!existing) {
      // ── 3a. Fresh insert ───────────────────────────────────────────────────
      // Strip non-column fields (variant) before passing to Supabase.
      const { variant: _v, ...insertable } = input;
      void _v;
      const { data, error } = await sb
        .from("loops")
        .insert({
          ...insertable,
          intent_key:                   intentKey,
          status:                       "open",
          signal_count:                 1,
          first_seen_at:                new Date().toISOString(),
          last_seen_at:                 new Date().toISOString(),
          last_meaningful_evidence_at:  new Date().toISOString(),
          last_evidence_fingerprint:    incomingFingerprint,
          reopen_count:                 0,
        })
        .select("id")
        .single();

      if (error || !data) {
        stats.errors.push(`Insert loop ${input.normalized_key}: ${error?.message}`);
        return;
      }

      loopId = data.id;

      // Lineage self-seed: lineage_id = id for fresh loops.
      await sb.from("loops").update({ lineage_id: loopId }).eq("id", loopId);

      await sb.from("loop_actions").insert({
        loop_id:     loopId,
        action_type: "created",
        actor:       "system",
        note:        `Source: ${signalType} · intent_key=${intentKey}`,
      });

      stats.upserted++;
    } else {
      // ── 3b. Match found — update mutable fields ────────────────────────────
      loopId = existing.id;
      const updatePayload: Record<string, unknown> = {
        title:                input.title,
        priority_score:       input.priority_score,
        intervention_moment:  input.intervention_moment,
        notion_url:           input.notion_url,
        review_url:           input.review_url,
        due_at:               input.due_at,
        is_passive_discovery: input.is_passive_discovery,
        founder_owned:        input.founder_owned,
        last_seen_at:         new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      };

      // If we matched by intent_key, the new Notion page is a surrogate for the
      // same underlying topic. Keep the original linked_entity_id stable (don't
      // flip it), but refresh name/url for display.
      if (matchedBy === "normalized_key") {
        updatePayload.linked_entity_name = input.linked_entity_name;
      }

      // Backfill intent_key on old rows if missing.
      updatePayload.intent_key = intentKey;

      await sb.from("loops").update(updatePayload).eq("id", loopId);
      stats.upserted++;
    }

    // ── 4. Insert signal (dedup by unique: loop_id + signal_type + source_id) ──
    const { error: sigError, data: sigData } = await sb
      .from("loop_signals")
      .insert({
        loop_id:        loopId,
        signal_type:    signalType,
        source_id:      signalSourceId,
        source_name:    signalSourceName,
        source_excerpt: signalExcerpt,
        captured_at:    new Date().toISOString(),
      })
      .select("id");

    const isNewSignal = !sigError && sigData && sigData.length > 0;

    // ── 5. Reopen gate — STRICT materially-new evidence check ─────────────────
    //
    //  An existing CLOSED loop may reopen only when:
    //    - founder_interest ≠ 'dropped'                 (permanent human veto)
    //    - AND (one of):
    //        * auto-resolved + source re-activated + materially new evidence,
    //        * user-dismissed + brand-new signal + materially new evidence.
    //
    //  Paraphrase / regenerator rewrite → suppressed. Signal is still recorded
    //  but the loop stays closed.

    if (existing &&
        (existing.status === "resolved" || existing.status === "dismissed")) {

      const founderDropped = existing.founder_interest === "dropped";
      const autoResolved   = existing.status === "resolved";
      const userDismissed  = existing.status === "dismissed";

      const materiallyNew = isMateriallyNewEvidence({
        previousFingerprint: existing.last_evidence_fingerprint ?? null,
        previousSignalType:  null,  // best-effort; prior signal_type not tracked on row
        incomingFingerprint,
        incomingSignalType:  signalType,
      });

      const shouldReopen =
        !founderDropped &&
        materiallyNew &&
        (autoResolved || (userDismissed && isNewSignal));

      if (shouldReopen) {
        const nowIso = new Date().toISOString();
        // Fetch current reopen_count so we can increment in-flight.
        const { data: currentRow } = await sb
          .from("loops")
          .select("reopen_count")
          .eq("id", loopId)
          .single();
        const nextReopenCount = (currentRow?.reopen_count ?? 0) + 1;

        await sb.from("loops").update({
          status:                       "reopened",
          reopened_at:                  nowIso,
          reopen_count:                 nextReopenCount,
          last_meaningful_evidence_at:  nowIso,
          last_evidence_fingerprint:    incomingFingerprint,
          updated_at:                   nowIso,
        }).eq("id", loopId);

        await sb.from("loop_actions").insert({
          loop_id:     loopId,
          action_type: "reopened",
          actor:       "system",
          note:        `Reopened · matchedBy=${matchedBy} · signal=${signalType} · ` +
                       `${autoResolved ? "source re-active" : "new signal on dismissed"} · ` +
                       `fingerprint changed`,
        });
        stats.reopened++;
      } else if (!materiallyNew) {
        // Matched a closed loop but evidence is not materially new — suppress.
        console.warn(
          `[sync-loops] Suppressed reopen of ${existing.id} (status=${existing.status}, ` +
          `matchedBy=${matchedBy}) — evidence not materially new (paraphrase detected).`,
        );
        stats.suppressed_reopens++;
      }
    } else if (existing && isNewSignal) {
      // Active loop, new signal arrived — refresh meaningful-evidence watermark.
      const materiallyNew = isMateriallyNewEvidence({
        previousFingerprint: existing.last_evidence_fingerprint ?? null,
        previousSignalType:  null,
        incomingFingerprint,
        incomingSignalType:  signalType,
      });
      if (materiallyNew) {
        await sb.from("loops").update({
          last_meaningful_evidence_at: new Date().toISOString(),
          last_evidence_fingerprint:   incomingFingerprint,
        }).eq("id", loopId);
      }
    } else if (!existing) {
      // fresh insert already set fingerprint above
    }

    // ── 6. Refresh signal_count + priority from actual rows ───────────────────
    const { count } = await sb
      .from("loop_signals")
      .select("id", { count: "exact", head: true })
      .eq("loop_id", loopId);

    if (count !== null) {
      const newScore = computePriorityScore(input.loop_type, {
        dueAt:             input.due_at,
        signalCount:       count,
        linkedEntityType:  input.linked_entity_type,
        opportunityStage:  input.linked_entity_type === "opportunity" ? input.linked_entity_name : undefined,
        founderOwned:      input.founder_owned,
      });
      await sb.from("loops").update({ signal_count: count, priority_score: Math.min(newScore, 100) }).eq("id", loopId);
    }

    if (isNewSignal) stats.signals_added++;
    else stats.skipped++;

  } catch (err) {
    stats.errors.push(`upsertLoop ${input.normalized_key}: ${String(err)}`);
  }
}

// ─── Source 1: Evidence ───────────────────────────────────────────────────────
// Supabase-first since 2026-04-17: sync-evidence now runs at 7:30am,
// 30 minutes before sync-loops at 8am. Notion fallback preserved.

async function syncEvidenceLoops(stats: Stats): Promise<void> {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 86400000;

  type EvidenceItem = {
    id: string;
    notion_url: string;
    dateCaptured: string | null;
    title: string;
    excerpt: string | null;
  };

  let evidenceItems: EvidenceItem[] = [];
  let usedSupabase = false;

  // ── Supabase path ────────────────────────────────────────────────────────
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("evidence")
      .select("notion_id, title, source_excerpt, date_captured")
      .eq("validation_status", "Validated")
      .eq("evidence_type", "Blocker")
      .order("date_captured", { ascending: false })
      .limit(30);

    if (!error && data && data.length > 0) {
      evidenceItems = data.map(e => ({
        id:           e.notion_id,
        // Reconstruct Notion URL from ID — redirects correctly, no slug needed
        notion_url:   `https://www.notion.so/${e.notion_id.replace(/-/g, "")}`,
        dateCaptured: e.date_captured,
        title:        e.title ?? "Untitled evidence",
        excerpt:      e.source_excerpt ?? null,
      }));
      usedSupabase = true;
    }
  } catch {
    // Supabase unavailable — fall through to Notion
  }

  // ── Notion fallback ──────────────────────────────────────────────────────
  if (!usedSupabase) {
    // Evidence Type "Commitment" does not exist in this Notion DB.
    // Only surface Blockers — commitment loops come from Opportunities.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await notion.databases.query({
      database_id: DB.evidence,
      filter: {
        and: [
          { property: "Validation Status", select: { equals: "Validated" } },
          { property: "Evidence Type",     select: { equals: "Blocker"   } },
        ],
      },
      sorts: [{ property: "Date Captured", direction: "descending" }],
      page_size: 30,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidenceItems = (res.results as any[]).map(page => ({
      id:           page.id,
      notion_url:   page.url ?? "",
      dateCaptured: dt(page.properties["Date Captured"]),
      title:        text(page.properties["Evidence Title"]) || "Untitled evidence",
      excerpt:      text(page.properties["Source Excerpt"]) || null,
    }));
  }

  // ── Process items ────────────────────────────────────────────────────────
  for (const item of evidenceItems) {
    if (!item.dateCaptured) continue;

    const ageMs = now - new Date(item.dateCaptured).getTime();
    if (ageMs > THIRTY_DAYS) continue;

    const loopType: LoopType = "blocker";
    const taskTitle = item.excerpt && item.excerpt.length >= 20
      ? item.excerpt.slice(0, 140)
      : item.title.slice(0, 140);

    // Skip evidence clearly delegated to someone other than the operator.
    // e.g. "Neil to follow up on speaker flights" → not Jose's direct action.
    if (!isOperatorActionable(item.title, item.excerpt)) continue;

    const normalizedKey = buildNormalizedKey("evidence", item.id);
    const founderOwned = isFounderOwned(item.title);
    const score = computePriorityScore(loopType, { signalCount: 1, founderOwned });
    const intentKey = buildIntentKey({
      entityType:  "evidence",
      entitySlug:  item.title,
      loopType,
      variant:     null,
      contentText: item.excerpt || item.title,
    });

    await upsertLoop(
      {
        normalized_key:       normalizedKey,
        intent_key:           intentKey,
        variant:              null,
        title:                taskTitle,
        loop_type:            loopType,
        intervention_moment:  "urgent",
        priority_score:       score,
        linked_entity_type:   "evidence",
        linked_entity_id:     item.id,
        linked_entity_name:   item.title,
        notion_url:           item.notion_url,
        review_url:           null,
        due_at:               null,
        is_passive_discovery: false,
        founder_owned:        founderOwned,
      },
      "evidence_blocker",
      item.id,
      item.title,
      item.excerpt,
      stats,
    );
  }
}

// ─── Source 2: Opportunities ──────────────────────────────────────────────────

async function syncOpportunityLoops(stats: Stats): Promise<void> {
  const res = await notion.databases.query({
    database_id: DB.opportunities,
    filter: {
      or: [
        { property: "Follow-up Status", select: { equals: "Needed"  } },
        { property: "Follow-up Status", select: { equals: "Waiting" } },
        { property: "Follow-up Status", select: { equals: "Sent"    } },
        { property: "Opportunity Status", select: { equals: "Active"     } },
        { property: "Opportunity Status", select: { equals: "Qualifying" } },
        { property: "Opportunity Status", select: { equals: "New"        } },
      ],
    },
    sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    page_size: 30,
  });

  const TERMINAL_STAGES    = new Set(["Closed Won", "Closed Lost", "Stalled"]);
  const TERMINAL_STATUSES  = new Set(["Done", "Dropped"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const stage        = sel(page.properties["Opportunity Status"]);
    const followStatus = sel(page.properties["Follow-up Status"]);

    if (TERMINAL_STAGES.has(stage))    continue;
    if (TERMINAL_STATUSES.has(followStatus)) continue;

    const oppType        = sel(page.properties["Opportunity Type"]) || "";
    const name           = text(page.properties["Opportunity Name"]) || text(page.properties["Name"]) || "Untitled";
    const pendingAction  = text(page.properties["Trigger / Signal"]) || null;  // raw field value
    const nextMeeting    = dt(page.properties["Next Meeting Date"]);
    const reviewUrl      = page.properties["Source URL"]?.url ?? null;
    const lastEdited     = page.last_edited_time?.slice(0, 10) ?? null;
    const opportunityScore: number | null = page.properties["Opportunity Score"]?.number ?? null;

    // Grant records: pending action is sourcing context, not a task
    if (isGrant(oppType)) {
      // Only create a loop if there is an explicit Follow-up Status set by a human
      const hasStatus = ["Needed", "Waiting", "Sent"].includes(followStatus);
      if (!hasStatus) continue;
    }

    // Recency gate on pending action: ignore if > 30 days since last edit
    const daysSinceEdit = lastEdited
      ? Math.floor((Date.now() - new Date(lastEdited).getTime()) / 86400000)
      : 999;
    const pendingIsRecent = daysSinceEdit <= 30;

    const effectivePending = pendingIsRecent ? pendingAction : null;

    const classification = classifyOpportunityLoop({
      stage,
      followUpStatus:   followStatus,
      type:             oppType,
      nextMeetingDate:  nextMeeting,
      reviewUrl,
      pendingAction:    effectivePending,   // human-actionable only
      rawTriggerSignal: pendingAction,       // raw field — may include SIGNALS: prefixed content
      opportunityScore,
      daysSinceEdit,
    });

    if (!classification) continue; // no valid signal — skip

    const { loopType, interventionMoment, variant } = classification;

    // Enrich generic titles with opportunity name so every task reads as a real action.
    // The classifier returns template titles; the sync route has the actual name.
    const nameSlug = name.slice(0, 80);
    const title = (() => {
      switch (classification.title) {
        case "Follow up":                          return `Follow up — ${nameSlug}`;
        case "Send follow-up reply":               return `Reply to ${nameSlug}`;
        case "Review doc":                         return `Review proposal — ${nameSlug}`;
        case "Review doc before meeting":          return `Review before meeting — ${nameSlug}`;
        case "Qualify or decide on new opportunity": return `Qualify or decide — ${nameSlug}`;
        case "Decide on inbound from email thread": return `Decide on inbound — ${nameSlug}`;
        case "No active signal — check in needed": return `Check in on — ${nameSlug}`;
        default: return classification.title; // already specific (pendingAction text)
      }
    })();
    const normalizedKey = buildNormalizedKey("opportunity", page.id, variant);
    const passive =
      isPassiveDiscovery(normalizedKey, "opportunity") ||
      // :followup + decision = Gmail inbound on a New-stage opp (no prior engagement)
      (variant === "followup" && loopType === "decision") ||
      // Grants with only a status trigger (no meeting, no review doc)
      (isGrant(oppType) && !nextMeeting && !reviewUrl);

    const founderOwned = isFounderOwned(name);
    const score = computePriorityScore(loopType, {
      dueAt:            nextMeeting,
      signalCount:      1,
      linkedEntityType: "opportunity",
      opportunityStage: stage,
      founderOwned,
    });

    const intentKey = buildIntentKey({
      entityType:  "opportunity",
      entitySlug:  name,
      loopType,
      variant,
      contentText: isActionablePendingAction(effectivePending) ? effectivePending! : title,
    });

    await upsertLoop(
      {
        normalized_key:       normalizedKey,
        intent_key:           intentKey,
        variant,
        title,
        loop_type:            loopType,
        intervention_moment:  interventionMoment,
        priority_score:       score,
        linked_entity_type:   "opportunity",
        linked_entity_id:     page.id,
        linked_entity_name:   name,
        notion_url:           page.url ?? "",
        review_url:           reviewUrl && !reviewUrl.includes("mail.google.com") ? reviewUrl : null,
        due_at:               nextMeeting ? new Date(nextMeeting).toISOString() : null,
        is_passive_discovery: passive,
        founder_owned:        founderOwned,
      },
      "opportunity_signal",
      page.id,
      name,
      isActionablePendingAction(effectivePending) ? effectivePending!.slice(0, 500) : null,
      stats,
    );
  }
}

// ─── Source 3: Projects ───────────────────────────────────────────────────────

async function syncProjectLoops(stats: Stats): Promise<void> {
  const res = await notion.databases.query({
    database_id: DB.projects,
    filter: {
      and: [
        { property: "Project Status", select: { equals: "Active" } },
        { property: "Project Update Needed?", checkbox: { equals: true } },
      ],
    },
    sorts: [{ property: "Last Status Update", direction: "ascending" }],
    page_size: 20,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const workspace = sel(page.properties["Primary Workspace"]) || "hall";
    if (workspace === "garage") continue;

    const name      = text(page.properties["Project Name"]) || "Untitled Project";
    const obstacle  = text(page.properties["Hall Obstacles"]);
    const challenge = text(page.properties["Hall Challenge"]);
    const issueContent = obstacle || challenge;

    const taskTitle = issueContent && issueContent.length >= 15
      ? issueContent.slice(0, 140)
      : `Write project update — ${name}`;

    const loopType: LoopType = issueContent.toLowerCase().includes("block") ? "blocker" : "commitment";
    const normalizedKey = buildNormalizedKey("project", page.id, "obstacle");
    const founderOwned = isFounderOwned(name);
    const score = computePriorityScore(loopType, { signalCount: 1, founderOwned });

    const intentKey = buildIntentKey({
      entityType:  "project",
      entitySlug:  name,
      loopType,
      variant:     "obstacle",
      contentText: issueContent || taskTitle,
    });

    await upsertLoop(
      {
        normalized_key:       normalizedKey,
        intent_key:           intentKey,
        variant:              "obstacle",
        title:                taskTitle,
        loop_type:            loopType,
        intervention_moment:  "this_week",
        priority_score:       score,
        linked_entity_type:   "project",
        linked_entity_id:     page.id,
        linked_entity_name:   name,
        notion_url:           page.url ?? "",
        review_url:           null,
        due_at:               null,
        is_passive_discovery: false,
        founder_owned:        founderOwned,
      },
      "project_obstacle",
      page.id,
      name,
      issueContent || null,
      stats,
    );
  }
}

// ─── Auto-resolve stale loops ─────────────────────────────────────────────────
// Tiered thresholds to prevent CoS going hollow between syncs:
//   blocker / commitment → 4 hours  (high-cost to lose; tolerate sync delays)
//   everything else      → 65 min   (2 sync cycles — quick cleanup)
// Loops with founder_interest = 'dropped' are never reopened by sync, but are
// still auto-resolved here so they don't accumulate indefinitely.

async function autoResolveStaleLoops(): Promise<number> {
  const sb = getSupabaseServerClient();

  const stdCutoff       = new Date(Date.now() -  65 * 60 * 1000).toISOString();
  const criticalCutoff  = new Date(Date.now() - 240 * 60 * 1000).toISOString(); // 4 h

  const nowIso = new Date().toISOString();

  // Resolve low-priority loops after 65 min.
  // Only act on 'open' / 'reopened' — leave 'in_progress' and 'waiting' alone.
  const { data: stdData } = await sb
    .from("loops")
    .update({ status: "resolved", resolved_at: nowIso, updated_at: nowIso })
    .in("status", ["open", "reopened"])
    .not("loop_type", "in", "(blocker,commitment)")
    .lt("last_seen_at", stdCutoff)
    .select("id");

  // Resolve blockers/commitments only after 4 h
  const { data: critData } = await sb
    .from("loops")
    .update({ status: "resolved", resolved_at: nowIso, updated_at: nowIso })
    .in("status", ["open", "reopened"])
    .in("loop_type", ["blocker", "commitment"])
    .lt("last_seen_at", criticalCutoff)
    .select("id");

  const allResolved = [...(stdData ?? []), ...(critData ?? [])];

  if (allResolved.length > 0) {
    await sb.from("loop_actions").insert(
      allResolved.map((row: { id: string }) => ({
        loop_id:     row.id,
        action_type: "resolved",
        actor:       "system",
        note:        "Auto-resolved: source record no longer active",
      })),
    );
  }

  return allResolved.length;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats: Stats = {
    upserted: 0,
    skipped: 0,
    signals_added: 0,
    reopened: 0,
    suppressed_reopens: 0,
    errors: [],
  };

  try {
    // Run all three source syncs in sequence (Notion rate limits)
    await syncEvidenceLoops(stats);
    await syncOpportunityLoops(stats);
    await syncProjectLoops(stats);

    // Auto-resolve loops whose source is gone
    const autoResolved = await autoResolveStaleLoops();

    return NextResponse.json({
      ok: true,
      upserted:           stats.upserted,
      skipped:            stats.skipped,
      signals_added:      stats.signals_added,
      reopened:           stats.reopened,
      suppressed_reopens: stats.suppressed_reopens,
      auto_resolved:      autoResolved,
      errors:             stats.errors,
    });
  } catch (err) {
    console.error("[sync-loops] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

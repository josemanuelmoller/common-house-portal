/**
 * POST /api/sync-loops
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
  classifyOpportunityLoop,
  computePriorityScore,
  isActionablePendingAction,
  isGrant,
  type Loop,
  type LoopType,
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

// ─── Upsert helpers ───────────────────────────────────────────────────────────

type UpsertLoopInput = Omit<Loop,
  "id" | "status" | "signal_count" | "first_seen_at" | "last_seen_at" |
  "last_action_at" | "created_at" | "updated_at"
>;

type Stats = { upserted: number; skipped: number; signals_added: number; errors: string[] };

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
    // 1. Upsert the loop row (ON CONFLICT normalized_key)
    //    - On insert: all fields written fresh
    //    - On conflict: update mutable fields only; preserve status/first_seen_at
    const { data: existing } = await sb
      .from("loops")
      .select("id, status, signal_count")
      .eq("normalized_key", input.normalized_key)
      .single();

    let loopId: string;

    if (!existing) {
      // Fresh insert
      const { data, error } = await sb
        .from("loops")
        .insert({
          ...input,
          status: "open",
          signal_count: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !data) {
        stats.errors.push(`Insert loop ${input.normalized_key}: ${error?.message}`);
        return;
      }

      loopId = data.id;

      // Log creation action
      await sb.from("loop_actions").insert({
        loop_id: loopId,
        action_type: "created",
        actor: "system",
        note: `Source: ${signalType}`,
      });

      stats.upserted++;
    } else {
      loopId = existing.id;

      // Update mutable fields (priority score may have changed; reopen if dismissed/resolved and new signal)
      const shouldReopen = existing.status === "resolved" || existing.status === "dismissed";
      const updatePayload: Record<string, unknown> = {
        title:               input.title,
        priority_score:      input.priority_score,
        intervention_moment: input.intervention_moment,
        notion_url:          input.notion_url,
        review_url:          input.review_url,
        due_at:              input.due_at,
        last_seen_at:        new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      };

      if (shouldReopen) {
        // Only reopen if the incoming signal is new (checked below when inserting signal)
        // We'll handle reopen after signal dedup check
      }

      await sb.from("loops").update(updatePayload).eq("id", loopId);
      stats.upserted++;
    }

    // 2. Insert signal (dedup by unique constraint: loop_id + signal_type + source_id)
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

    // 3. If loop was resolved/dismissed AND this is a new signal → reopen it
    if (existing && (existing.status === "resolved" || existing.status === "dismissed") && isNewSignal) {
      await sb.from("loops").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", loopId);
      await sb.from("loop_actions").insert({
        loop_id: loopId, action_type: "reopened", actor: "system",
        note: `Reopened by new signal: ${signalType}`,
      });
    }

    // 4. Refresh signal_count from actual rows
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

async function syncEvidenceLoops(stats: Stats): Promise<void> {
  const now = Date.now();
  const THIRTY_DAYS  = 30 * 86400000;
  const FOURTEEN_DAYS = 14 * 86400000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: {
      and: [
        { property: "Validation Status", select: { equals: "Validated" } },
        {
          or: [
            { property: "Evidence Type", select: { equals: "Blocker" } },
            { property: "Evidence Type", select: { equals: "Commitment" } },
          ],
        },
      ],
    },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 30,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of res.results as any[]) {
    const evidenceType  = sel(page.properties["Evidence Type"]);
    const dateCaptured  = dt(page.properties["Date Captured"]);
    if (!dateCaptured) continue;

    const ageMs     = now - new Date(dateCaptured).getTime();
    const windowMs  = evidenceType === "Blocker" ? THIRTY_DAYS : FOURTEEN_DAYS;
    if (ageMs > windowMs) continue;

    const title    = text(page.properties["Evidence Title"]) || "Untitled evidence";
    const excerpt  = text(page.properties["Source Excerpt"]);
    const loopType: LoopType = evidenceType === "Blocker" ? "blocker" : "commitment";
    const taskTitle = excerpt && excerpt.length >= 20 ? excerpt.slice(0, 140) : title.slice(0, 140);

    const normalizedKey = buildNormalizedKey("evidence", page.id);
    const score = computePriorityScore(loopType, { signalCount: 1 });

    await upsertLoop(
      {
        normalized_key:      normalizedKey,
        title:               taskTitle,
        loop_type:           loopType,
        intervention_moment: loopType === "blocker" ? "urgent" : "this_week",
        priority_score:      score,
        linked_entity_type:  "evidence",
        linked_entity_id:    page.id,
        linked_entity_name:  title,
        notion_url:          page.url ?? "",
        review_url:          null,
        due_at:              null,
      },
      evidenceType === "Blocker" ? "evidence_blocker" : "evidence_commitment",
      page.id,
      title,
      excerpt || null,
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

    const oppType      = sel(page.properties["Opportunity Type"]) || "";
    const name         = text(page.properties["Opportunity Name"]) || text(page.properties["Name"]) || "Untitled";
    const pendingAction = text(page.properties["Trigger / Signal"]) || null;
    const nextMeeting  = dt(page.properties["Next Meeting Date"]);
    const reviewUrl    = page.properties["Source URL"]?.url ?? null;
    const lastEdited   = page.last_edited_time?.slice(0, 10) ?? null;

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
      followUpStatus: followStatus,
      type:           oppType,
      nextMeetingDate: nextMeeting,
      reviewUrl,
      pendingAction:  effectivePending,
    });

    if (!classification) continue; // no valid signal — skip

    const { loopType, interventionMoment, variant, title } = classification;
    const normalizedKey = buildNormalizedKey("opportunity", page.id, variant);

    const score = computePriorityScore(loopType, {
      dueAt:            nextMeeting,
      signalCount:      1,
      linkedEntityType: "opportunity",
      opportunityStage: stage,
    });

    await upsertLoop(
      {
        normalized_key:      normalizedKey,
        title,
        loop_type:           loopType,
        intervention_moment: interventionMoment,
        priority_score:      score,
        linked_entity_type:  "opportunity",
        linked_entity_id:    page.id,
        linked_entity_name:  name,
        notion_url:          page.url ?? "",
        review_url:          reviewUrl && !reviewUrl.includes("mail.google.com") ? reviewUrl : null,
        due_at:              nextMeeting ? new Date(nextMeeting).toISOString() : null,
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
    const score = computePriorityScore(loopType, { signalCount: 1 });

    await upsertLoop(
      {
        normalized_key:      normalizedKey,
        title:               taskTitle,
        loop_type:           loopType,
        intervention_moment: "this_week",
        priority_score:      score,
        linked_entity_type:  "project",
        linked_entity_id:    page.id,
        linked_entity_name:  name,
        notion_url:          page.url ?? "",
        review_url:          null,
        due_at:              null,
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
// Loops whose source records have been resolved, won, or dropped should not
// linger. We resolve open loops whose last_seen_at is > 2 sync cycles old.
// Sync runs every 30 min → 2 cycles = 65 min to be safe.

async function autoResolveStaleLoops(): Promise<number> {
  const sb = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - 65 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("loops")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("status", "open")
    .lt("last_seen_at", cutoff)
    .select("id");

  if (error) return 0;

  if (data && data.length > 0) {
    await sb.from("loop_actions").insert(
      data.map((row: { id: string }) => ({
        loop_id: row.id,
        action_type: "resolved",
        actor: "system",
        note: "Auto-resolved: source record no longer active",
      })),
    );
  }

  return data?.length ?? 0;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats: Stats = { upserted: 0, skipped: 0, signals_added: 0, errors: [] };

  try {
    // Run all three source syncs in sequence (Notion rate limits)
    await syncEvidenceLoops(stats);
    await syncOpportunityLoops(stats);
    await syncProjectLoops(stats);

    // Auto-resolve loops whose source is gone
    const autoResolved = await autoResolveStaleLoops();

    return NextResponse.json({
      ok: true,
      upserted:     stats.upserted,
      skipped:      stats.skipped,
      signals_added: stats.signals_added,
      auto_resolved: autoResolved,
      errors:       stats.errors,
    });
  } catch (err) {
    console.error("[sync-loops] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { notion, getAllEvidence } from "@/lib/notion";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 180;

// Validation operator — two-pass sweep.
//
// Pass 1 (New → Validated / Reviewed): aggressive auto-validation of freshly
// created evidence that matches AUTO_VALIDATE criteria from the agent spec.
// Goal: New queue only contains items that genuinely need human judgment.
//
// Pass 2 (Reviewed → Validated / Archived): auto-validate reviewed items with
// High/Medium confidence + excerpt, and archive aged low-value Reviewed items
// (14+ days old, operational types only) so the "Passing through" queue stays
// small.
//
// Called by Vercel cron daily at 03:00 UTC (weekdays).
// Also callable manually — requires x-agent-key or Authorization: Bearer <CRON_SECRET>.

const AUTO_VALIDATE_TYPES = new Set([
  "Process Step",
  "Outcome",
  "Dependency",
  "Requirement",
]);

const ARCHIVE_ELIGIBLE_TYPES = new Set([
  "Process Step",
  "Outcome",
  "Dependency",
]);

const SPECULATIVE_TOKENS = [
  "may ",
  "might ",
  "could ",
  "likely ",
  "appears to",
  "suggests",
  "seems",
];

function hasSpeculativePhrasing(title: string): boolean {
  const lower = (title || "").toLowerCase();
  return SPECULATIVE_TOKENS.some(t => lower.includes(t));
}

function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

type EvidenceLike = {
  id: string;
  title: string;
  type: string;
  confidence: string;
  excerpt: string;
  projectId: string | null;
  dateCaptured: string | null;
};

type Classification =
  | { tier: "AUTO_VALIDATE"; reason: string }
  | { tier: "AUTO_REVIEW"; reason: string }
  | { tier: "ARCHIVE"; reason: string }
  | { tier: "KEEP_NEW"; reason: string }
  | { tier: "KEEP_REVIEWED"; reason: string };

function classifyNew(ev: EvidenceLike): Classification {
  const hasExcerpt = Boolean(ev.excerpt?.trim());
  const hasProject = Boolean(ev.projectId);
  const conf = ev.confidence;

  if (!hasExcerpt || !hasProject) {
    return { tier: "KEEP_NEW", reason: "missing excerpt or project — needs human" };
  }
  if (conf === "Low" || !conf) {
    return { tier: "KEEP_NEW", reason: "Low confidence — needs human" };
  }
  if (hasSpeculativePhrasing(ev.title)) {
    return { tier: "AUTO_REVIEW", reason: "speculative phrasing — engine re-check" };
  }
  if (AUTO_VALIDATE_TYPES.has(ev.type) && (conf === "High" || conf === "Medium")) {
    return { tier: "AUTO_VALIDATE", reason: `${ev.type} + ${conf} conf — operational fact` };
  }
  if (ev.type === "Decision" && conf === "High") {
    return { tier: "AUTO_VALIDATE", reason: "Decision + High conf — grounded" };
  }
  if (ev.type === "Blocker" && conf === "High") {
    return { tier: "AUTO_VALIDATE", reason: "Blocker + High conf — escalated downstream" };
  }
  // Everything else → promote to Reviewed (cheaper for engine to re-score later)
  return { tier: "AUTO_REVIEW", reason: "defer to engine re-check" };
}

function classifyReviewed(ev: EvidenceLike): Classification {
  const hasExcerpt = Boolean(ev.excerpt?.trim());
  const conf = ev.confidence;
  const age = daysBetween(ev.dateCaptured);

  // Primary path: auto-validate if excerpt + Med/High confidence
  if (hasExcerpt && (conf === "High" || conf === "Medium")) {
    return { tier: "AUTO_VALIDATE", reason: `${conf} conf + excerpt` };
  }

  // Archive aged low-value Reviewed that will never clear:
  // - 14+ days old
  // - operational/low-signal type (no decisions or blockers)
  // - either no excerpt or Low confidence (i.e., blocked from auto-validate)
  if (age >= 14 && ARCHIVE_ELIGIBLE_TYPES.has(ev.type)) {
    return { tier: "ARCHIVE", reason: `aged ${age}d + ${ev.type} (low-signal) — archived` };
  }

  // Otherwise keep as Reviewed for human/next sweep
  return { tier: "KEEP_REVIEWED", reason: "held for human review" };
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [newItems, reviewedItems] = await Promise.all([
    getAllEvidence("New"),
    getAllEvidence("Reviewed"),
  ]);
  const sb = getSupabaseServerClient();

  const results = {
    new_total: newItems.length,
    reviewed_total: reviewedItems.length,
    validated_from_new: 0,
    promoted_to_reviewed: 0,
    kept_new: 0,
    validated_from_reviewed: 0,
    archived: 0,
    kept_reviewed: 0,
    errors: 0,
  };

  async function writeStatus(id: string, status: "Validated" | "Reviewed" | "Superseded") {
    await notion.pages.update({
      page_id: id,
      properties: { "Validation Status": { select: { name: status } } },
    });
    try {
      await sb.from("evidence")
        .update({ validation_status: status, updated_at: new Date().toISOString() })
        .eq("notion_id", id);
    } catch { /* non-critical */ }
  }

  // Pass 1 — New items
  for (const item of newItems) {
    try {
      const c = classifyNew(item);
      if (c.tier === "AUTO_VALIDATE") {
        await writeStatus(item.id, "Validated");
        results.validated_from_new++;
      } else if (c.tier === "AUTO_REVIEW") {
        await writeStatus(item.id, "Reviewed");
        results.promoted_to_reviewed++;
      } else {
        results.kept_new++;
      }
    } catch {
      results.errors++;
    }
  }

  // Pass 2 — Reviewed items
  for (const item of reviewedItems) {
    try {
      const c = classifyReviewed(item);
      if (c.tier === "AUTO_VALIDATE") {
        await writeStatus(item.id, "Validated");
        results.validated_from_reviewed++;
      } else if (c.tier === "ARCHIVE") {
        // Notion "Superseded" select exists in the Validation Status enum and
        // is the closest to archive without schema change.
        await writeStatus(item.id, "Superseded");
        results.archived++;
      } else {
        results.kept_reviewed++;
      }
    } catch {
      results.errors++;
    }
  }

  console.log("[validation-operator]", results);
  return NextResponse.json(results);
}

export const POST = withRoutineLog("validation-operator", _POST);
// Vercel cron calls GET — delegate to the same wrapped handler
export const GET = POST;

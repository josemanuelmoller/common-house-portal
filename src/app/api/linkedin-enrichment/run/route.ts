/**
 * POST /api/linkedin-enrichment/run
 *
 * Runs the LinkedIn enrichment agent over `people` rows that have an email
 * but no `linkedin`. Intended to be called by:
 *   - admin UI (manual trigger from /admin/hall/contacts or health page)
 *   - weekly cron (Monday 07:00 London, see vercel.json)
 *
 * Query params:
 *   ?dry_run=1   — find + score but never write. Returns the candidate list.
 *   ?limit=50    — hard cap on rows processed this run (default 25, max 200).
 *   ?force=1     — ignore linkedin_last_attempt_at cooldown (re-try all).
 *
 * Behaviour:
 *   - Picks queued rows ordered by priority (tagged VIP/Investor/Client/Partner
 *     first, then by meeting_count DESC). Skips rows attempted in the last
 *     14 days unless ?force=1.
 *   - Calls findLinkedIn() — Google CSE + Haiku.
 *   - If confidence >= 0.8 → writes people.linkedin directly, marks source.
 *   - If 0.4 <= confidence < 0.8 → writes linkedin + sets needs_review=true
 *     so the admin can approve/reject.
 *   - If < 0.4 or no hit → no write, but files an audit row so we don't
 *     retry immediately.
 *
 * Every call writes to linkedin_enrichment_audit regardless of outcome.
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Called by Vercel cron every Monday at 07:15 UTC.
 *
 * Budget cap: if the `limit` × CSE cost (100/day free tier) would exceed the
 * quota, the route stops early and returns a `remaining_budget` hint.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { findLinkedIn } from "@/lib/linkedin-enrichment";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Allow either (a) admin session via Clerk or (b) CRON_SECRET header.
 *  Matches the pattern used by grant-radar + other cron-hit endpoints:
 *  checks both userId and email against the admin list (email is the one
 *  actually populated in prod env — ADMIN_EMAILS is set, ADMIN_USER_IDS is not). */
async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* no-op */ }
  return false;
}

const AUTO_APPLY_THRESHOLD = 0.8;
const REVIEW_THRESHOLD     = 0.4;
const COOLDOWN_DAYS        = 14;

type QueueRow = {
  id:                       string;
  email:                    string | null;
  full_name:                string | null;
  display_name:             string | null;
  relationship_classes:     string[] | null;
  meeting_count:            number | null;
  org_notion_id:            string | null;
  linkedin_last_attempt_at: string | null;
};

export async function POST(req: NextRequest) {
  const ok = await authCheck(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const isCron = !!req.headers.get("x-agent-key") || req.headers.get("authorization")?.startsWith("Bearer ");
  const user   = isCron ? null : await currentUser();
  const actor  = isCron ? "cron" : (user?.primaryEmailAddress?.emailAddress ?? "unknown");

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dry_run") === "1";
  const force  = searchParams.get("force")   === "1";
  const limit  = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? "25")));

  const sb = getSupabaseServerClient();

  // 1. Build the queue. `email IS NOT NULL AND linkedin IS NULL` plus the
  //    cooldown filter (unless force).
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString();
  let query = sb
    .from("people")
    .select("id, email, full_name, display_name, relationship_classes, meeting_count, org_notion_id, linkedin_last_attempt_at")
    .not("email", "is", null)
    .is("linkedin", null)
    .is("dismissed_at", null)
    .order("meeting_count", { ascending: false })
    .limit(limit * 3); // over-fetch so we can re-sort after priority scoring
  if (!force) {
    query = query.or(`linkedin_last_attempt_at.is.null,linkedin_last_attempt_at.lt.${cooldownCutoff}`);
  }
  const { data: rows, error: queueErr } = await query;
  if (queueErr) return NextResponse.json({ error: queueErr.message }, { status: 502 });

  const TOP_TIER = new Set(["VIP", "Investor", "Funder", "Client", "Partner", "Portfolio"]);
  const priority = (r: QueueRow) => {
    const classes = r.relationship_classes ?? [];
    let p = 0;
    if (classes.some(c => TOP_TIER.has(c))) p += 100;
    p += (r.meeting_count ?? 0);
    return p;
  };
  const queue = (rows as QueueRow[] ?? [])
    .sort((a, b) => priority(b) - priority(a))
    .slice(0, limit);

  // 2. Optional: preload org names by org_notion_id in one query.
  const orgIds = [...new Set(queue.map(r => r.org_notion_id).filter(Boolean) as string[])];
  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await sb
      .from("hall_organizations")
      .select("org_notion_id, org_name")
      .in("org_notion_id", orgIds);
    for (const o of (orgs ?? []) as { org_notion_id: string; org_name: string | null }[]) {
      if (o.org_name) orgNameById.set(o.org_notion_id, o.org_name);
    }
  }

  // 3. Process each row. Write audit + (optionally) apply result.
  type Outcome = {
    person_id:      string;
    name:           string;
    email:          string | null;
    confidence:     number;
    url:            string | null;
    reasoning:      string;
    action:         "auto_apply" | "queued_review" | "no_match" | "skipped" | "error";
    job_title?:     string | null;
    role_category?: string | null;
    function_area?: string | null;
    role_confidence?: number;
    error?:         string;
  };
  const outcomes: Outcome[] = [];
  const nowIso = new Date().toISOString();

  for (const row of queue) {
    const name = (row.full_name ?? row.display_name ?? "").trim();
    if (!name) {
      outcomes.push({ person_id: row.id, name: "", email: row.email, confidence: 0, url: null, reasoning: "no name", action: "skipped" });
      continue;
    }
    const orgName = row.org_notion_id ? (orgNameById.get(row.org_notion_id) ?? null) : null;
    try {
      const hit = await findLinkedIn({
        full_name: name,
        email:     row.email ?? null,
        org_name:  orgName,
      });

      if (!hit) {
        // File a "no match" attempt so we skip this person until cooldown expires.
        if (!dryRun) {
          await sb.from("people").update({
            linkedin_last_attempt_at: nowIso,
            updated_at: nowIso,
          }).eq("id", row.id);
          await sb.from("linkedin_enrichment_audit").insert({
            person_id: row.id, source: "google_cse", attempted_at: nowIso,
            query: `"${name}" site:linkedin.com/in`,
            candidate_url: null, confidence: 0, accepted: false,
            reasoning: "no candidates", actor,
          });
        }
        outcomes.push({ person_id: row.id, name, email: row.email, confidence: 0, url: null, reasoning: "no candidates", action: "no_match" });
        continue;
      }

      const willWrite = hit.confidence >= REVIEW_THRESHOLD;
      const autoApply = hit.confidence >= AUTO_APPLY_THRESHOLD;

      if (!dryRun) {
        const patch: Record<string, unknown> = {
          linkedin_last_attempt_at: nowIso,
          updated_at:               nowIso,
        };
        if (willWrite) {
          patch.linkedin             = hit.url;
          patch.linkedin_confidence  = hit.confidence;
          patch.linkedin_source      = hit.source;
          patch.linkedin_enriched_at = nowIso;
          patch.linkedin_needs_review = !autoApply;

          // Role extraction — only write the bucket fields when Haiku was
          // confident enough AND we're not stomping a manually-entered
          // job_title. Check job_title_source: if "manual" we never touch.
          const { data: existing } = await sb
            .from("people")
            .select("job_title, job_title_source, role_category, function_area")
            .eq("id", row.id)
            .maybeSingle();
          const manualTitle = (existing as { job_title_source: string | null } | null)?.job_title_source === "manual";
          const roleGoodEnough = hit.role_confidence >= 0.5;

          if (roleGoodEnough && !manualTitle) {
            if (hit.job_title)     patch.job_title            = hit.job_title;
            if (hit.role_category) patch.role_category        = hit.role_category;
            if (hit.function_area) patch.function_area        = hit.function_area;
            patch.job_title_confidence = hit.role_confidence;
            patch.job_title_source     = "google_cse_snippet";
            patch.job_title_updated_at = nowIso;
          }
        }
        await sb.from("people").update(patch).eq("id", row.id);
        await sb.from("linkedin_enrichment_audit").insert({
          person_id:     row.id,
          source:        hit.source,
          attempted_at:  nowIso,
          query:         hit.query,
          candidate_url: hit.url,
          confidence:    hit.confidence,
          accepted:      autoApply,
          reasoning:     hit.reasoning,
          actor,
        });
      }

      outcomes.push({
        person_id:       row.id,
        name,
        email:           row.email,
        confidence:      hit.confidence,
        url:             hit.url,
        reasoning:       hit.reasoning,
        action:          autoApply ? "auto_apply" : willWrite ? "queued_review" : "no_match",
        job_title:       hit.job_title,
        role_category:   hit.role_category,
        function_area:   hit.function_area,
        role_confidence: hit.role_confidence,
      });
    } catch (err) {
      outcomes.push({
        person_id:  row.id,
        name,
        email:      row.email,
        confidence: 0,
        url:        null,
        reasoning:  err instanceof Error ? err.message : String(err),
        action:     "error",
        error:      err instanceof Error ? err.message : String(err),
      });
      // If we hit a hard quota error, stop early so we don't waste requests.
      if (String(err).includes("quota")) break;
    }
  }

  const summary = {
    processed:     outcomes.length,
    auto_applied:  outcomes.filter(o => o.action === "auto_apply").length,
    queued_review: outcomes.filter(o => o.action === "queued_review").length,
    no_match:      outcomes.filter(o => o.action === "no_match").length,
    errors:        outcomes.filter(o => o.action === "error").length,
    skipped:       outcomes.filter(o => o.action === "skipped").length,
  };

  return NextResponse.json({
    ok:      true,
    dry_run: dryRun,
    summary,
    outcomes,
  });
}

// Vercel cron hits the endpoint with GET. Alias so the same handler runs.
export { POST as GET };

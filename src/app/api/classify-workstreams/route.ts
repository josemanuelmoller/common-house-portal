/**
 * POST /api/classify-workstreams
 *
 * Classify sources into workstreams + propagate to their evidence.
 *
 * Modes:
 *   - source_ids: string[]     → classify only these (by notion_id)
 *   - since_days: number       → classify all sources since N days (default 30)
 *   - only_missing: boolean    → only rows where workstream is null (default true)
 *   - use_llm: boolean         → allow LLM fallback when rules fail (default false for backfill)
 *   - dry_run: boolean         → no writes
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 *
 * After classifying a source, all its linked evidence rows inherit the
 * workstream (so the knowledge-curator can use it as stakeholder_function
 * context).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  classifyWorkstreamRuleBased,
  classifyWorkstream,
} from "@/lib/workstreams";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

type SourceRow = {
  notion_id: string;
  title: string | null;
  processed_summary: string | null;
  project_notion_id: string | null;
  workstream: string | null;
};

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    source_ids?: string[];
    since_days?: number;
    only_missing?: boolean;
    use_llm?: boolean;
    dry_run?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const ids         = Array.isArray(body.source_ids) && body.source_ids.length > 0 ? body.source_ids : null;
  const sinceDays   = body.since_days ?? 30;
  const onlyMissing = body.only_missing ?? true;
  const useLLM      = body.use_llm ?? false;
  const dryRun      = Boolean(body.dry_run);

  const sb = getSupabaseServerClient();

  let q = sb.from("sources")
    .select("notion_id, title, processed_summary, project_notion_id, workstream");

  if (ids) {
    q = q.in("notion_id", ids);
  } else {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    q = q.gte("source_date", since.slice(0, 10));
  }
  if (onlyMissing) q = q.is("workstream", null);

  const { data, error } = await q.limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sources = (data as SourceRow[]) ?? [];
  const result = {
    total: sources.length,
    classified_rule: 0,
    classified_llm: 0,
    skipped_no_signal: 0,
    evidence_propagated: 0,
    errors: 0,
    samples: [] as Array<{ notion_id: string; title: string | null; workstream: string | null; via: string }>,
  };

  for (const src of sources) {
    try {
      let workstream: string | null = null;
      let via: "rule" | "llm" | "none" = "none";

      if (useLLM) {
        const out = await classifyWorkstream({
          title: src.title ?? "",
          processed_summary: src.processed_summary,
        });
        workstream = out.workstream;
        via = out.via;
      } else {
        const rule = classifyWorkstreamRuleBased({
          title: src.title,
          processed_summary: src.processed_summary,
        });
        workstream = rule.workstream;
        via = rule.workstream ? "rule" : "none";
      }

      if (!workstream) {
        result.skipped_no_signal++;
      } else {
        if (via === "rule") result.classified_rule++;
        else if (via === "llm") result.classified_llm++;

        if (!dryRun) {
          await sb.from("sources")
            .update({ workstream, updated_at: new Date().toISOString() })
            .eq("notion_id", src.notion_id);

          // Propagate to linked evidence rows that don't already have one.
          const { count } = await sb.from("evidence")
            .update({ workstream, updated_at: new Date().toISOString() }, { count: "exact" })
            .eq("source_notion_id", src.notion_id)
            .is("workstream", null);
          if (typeof count === "number") result.evidence_propagated += count;
        }

        if (result.samples.length < 10) {
          result.samples.push({ notion_id: src.notion_id, title: src.title, workstream, via });
        }
      }
    } catch {
      result.errors++;
    }
  }

  console.log("[classify-workstreams]", { ...result, samples: undefined });
  return NextResponse.json(result);
}

export const POST = withRoutineLog("classify-workstreams", _POST);
// Vercel cron fires GET — delegate
export const GET = POST;

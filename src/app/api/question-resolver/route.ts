/**
 * POST /api/question-resolver
 *
 * For each evidence row with resolution_status = 'open', look for a plausible
 * answer in LATER validated evidence of the SAME project (and, if available,
 * the same workstream). If found, mark 'answered' + link source. Otherwise,
 * if > 14d old, transition to 'stale'.
 *
 * Matching (v1 — keyword/bag of words):
 *   - extract keyword stems from open question's statement + title (3+ chars,
 *     filter common words)
 *   - candidate = later evidence in same project with >= 2 keyword overlap
 *   - pick best by recency
 *
 * v2 (future): pgvector cosine similarity. Schema-ready.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 *
 * Input body (all optional):
 *   - project_id: string      — limit to one project
 *   - stale_after_days: number (default 14)
 *   - dry_run: boolean (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 180;

const STOP_WORDS = new Set([
  // EN common
  "the","and","for","but","are","was","were","that","this","with","from","into","have","has","had","will","would","could","should","what","when","where","who","how","why","can","does","did","may","might","must","about","they","them","their","there","which","whose","whom","also","been","being","some","any","each","every","other","such","than","then","too","very","just","over","under","while","because","whether","however",
  // ES common
  "que","como","cual","cuales","cuando","donde","quien","quienes","para","por","con","sin","sobre","entre","pero","aunque","porque","si","no","sea","ser","son","fue","fueron","ha","han","había","haber","hace","hacen","hizo","puede","pueden","debe","deben","debería","serán","estar","esta","este","estas","estos","eso","esta","está","están","estaba","esos","esas","muy","tanto","más","menos","también","solo","solamente","todos","todas","ninguno","alguna","algunos","cualquier","mismo","misma","mismos",
]);

function keywordize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 4 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

type EvidenceRow = {
  notion_id: string;
  title: string | null;
  evidence_type: string | null;
  evidence_statement: string | null;
  source_excerpt: string | null;
  project_notion_id: string | null;
  workstream: string | null;
  source_notion_id: string | null;
  date_captured: string | null;
  resolution_status: string | null;
  resolved_at: string | null;
  resolved_by_source: string | null;
};

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { project_id?: string; stale_after_days?: number; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const staleAfter = body.stale_after_days ?? 14;
  const dryRun     = Boolean(body.dry_run);

  const sb = getSupabaseServerClient();

  // Fetch open questions
  let oq = sb.from("evidence")
    .select("notion_id, title, evidence_type, evidence_statement, source_excerpt, project_notion_id, workstream, source_notion_id, date_captured, resolution_status, resolved_at, resolved_by_source")
    .eq("resolution_status", "open");
  if (body.project_id) oq = oq.eq("project_notion_id", body.project_id);
  const { data: openQs, error: openErr } = await oq.limit(200);
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });

  const opens = (openQs as EvidenceRow[]) ?? [];
  const result = {
    open_total: opens.length,
    answered: 0,
    staled: 0,
    still_open: 0,
    errors: 0,
    samples: [] as Array<{ q_id: string; status: string; answered_by?: string | null; reason?: string }>,
  };

  for (const q of opens) {
    try {
      if (!q.project_notion_id || !q.date_captured) {
        result.still_open++;
        continue;
      }

      // Candidate answers: later evidence in the same project (and workstream
      // if set) that are not the same question.
      let cq = sb.from("evidence")
        .select("notion_id, title, evidence_statement, source_notion_id, date_captured, workstream")
        .eq("project_notion_id", q.project_notion_id)
        .eq("validation_status", "Validated")
        .gt("date_captured", q.date_captured)
        .neq("notion_id", q.notion_id);
      if (q.workstream) cq = cq.eq("workstream", q.workstream);
      const { data: candidates } = await cq.limit(100);

      const qKeywords = keywordize(`${q.title ?? ""} ${q.evidence_statement ?? ""}`);
      if (qKeywords.size < 2) {
        // too generic, skip matching; only age it to stale if eligible
      }

      let best: { id: string; overlap: number; sourceId: string | null } | null = null;
      for (const c of (candidates ?? [])) {
        const cKw = keywordize(`${c.title ?? ""} ${c.evidence_statement ?? ""}`);
        const overlap = intersectionSize(qKeywords, cKw);
        if (overlap >= 2 && (!best || overlap > best.overlap)) {
          best = { id: c.notion_id as string, overlap, sourceId: (c.source_notion_id as string | null) ?? null };
        }
      }

      if (best) {
        if (!dryRun) {
          await sb.from("evidence")
            .update({
              resolution_status: "answered",
              resolved_at: new Date().toISOString(),
              resolved_by_source: best.sourceId,
              updated_at: new Date().toISOString(),
            })
            .eq("notion_id", q.notion_id);
        }
        result.answered++;
        if (result.samples.length < 10) {
          result.samples.push({ q_id: q.notion_id, status: "answered", answered_by: best.sourceId, reason: `overlap=${best.overlap}` });
        }
        continue;
      }

      // Age check for stale
      const ageDays = Math.floor((Date.now() - new Date(q.date_captured).getTime()) / 86_400_000);
      if (ageDays >= staleAfter) {
        if (!dryRun) {
          await sb.from("evidence")
            .update({
              resolution_status: "stale",
              resolved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("notion_id", q.notion_id);
        }
        result.staled++;
        if (result.samples.length < 10) {
          result.samples.push({ q_id: q.notion_id, status: "stale", reason: `age=${ageDays}d` });
        }
        continue;
      }

      result.still_open++;
    } catch {
      result.errors++;
    }
  }

  console.log("[question-resolver]", { ...result, samples: undefined });
  return NextResponse.json(result);
}

export const POST = withRoutineLog("question-resolver", _POST);
export const GET = POST;

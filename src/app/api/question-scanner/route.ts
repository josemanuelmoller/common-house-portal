/**
 * POST /api/question-scanner
 *
 * Scans validated evidence for open, unanswered questions.
 *
 * Targets:
 *   - evidence_type in (Concern, Objection, Risk)  → inherently questions
 *   - Any evidence whose statement/title contains question-pattern phrasing
 *     ("what if", "how will", "I'm worried", ¿cómo, ¿qué, ends in ?)
 *
 * For each match, set resolution_status = 'open' (unless already set).
 * question-resolver (separate endpoint) transitions to 'answered' later.
 *
 * Idempotent: re-running won't flip 'answered' rows back to 'open'.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 *
 * Input body (all optional):
 *   - since_days: number (default 30)
 *   - only_missing: boolean (default true)  — skip rows that already have resolution_status
 *   - dry_run: boolean (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 180;

// Regex bank — matches common question / concern phrasing in EN + ES.
const QUESTION_PATTERNS: RegExp[] = [
  /\?$/,                                                  // ends in ?
  /\b(what if|how will|how do we|what about|who will|when will|will there|can we|should we|do we|is it|are we)\b/i,
  /\b(i'm worried|i am worried|my concern|we're worried|are we sure|not sure if)\b/i,
  /\b(ensure|make sure|verify|confirm)\b/i,               // action-request phrasing
  /\b(qué pasa si|cómo hacemos|cómo vamos|quién va|cuándo|qué pasará|me preocupa|no estoy seguro|asegurar|verificar|confirmar)\b/i,
  /¿/,                                                    // Spanish inverted question mark
];

const QUESTIONISH_TYPES = new Set(["Concern", "Objection", "Risk"]);

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
  resolution_status: string | null;
  date_captured: string | null;
};

function looksLikeOpenQuestion(ev: EvidenceRow): boolean {
  if (ev.evidence_type && QUESTIONISH_TYPES.has(ev.evidence_type)) return true;
  const haystack = `${ev.title ?? ""}\n${ev.evidence_statement ?? ""}`;
  return QUESTION_PATTERNS.some(rx => rx.test(haystack));
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { since_days?: number; only_missing?: boolean; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const sinceDays   = body.since_days ?? 30;
  const onlyMissing = body.only_missing ?? true;
  const dryRun      = Boolean(body.dry_run);

  const sb = getSupabaseServerClient();

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

  let q = sb.from("evidence")
    .select("notion_id, title, evidence_type, evidence_statement, resolution_status, date_captured")
    .eq("validation_status", "Validated")
    .gte("date_captured", since);
  if (onlyMissing) q = q.is("resolution_status", null);

  const { data, error } = await q.limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as EvidenceRow[]) ?? [];
  const result = {
    scanned: rows.length,
    marked_open: 0,
    not_a_question: 0,
    already_set: 0,
    errors: 0,
  };

  for (const ev of rows) {
    try {
      if (ev.resolution_status) { result.already_set++; continue; }
      if (!looksLikeOpenQuestion(ev)) { result.not_a_question++; continue; }

      if (!dryRun) {
        await sb.from("evidence")
          .update({ resolution_status: "open", updated_at: new Date().toISOString() })
          .eq("notion_id", ev.notion_id);
      }
      result.marked_open++;
    } catch {
      result.errors++;
    }
  }

  console.log("[question-scanner]", result);
  return NextResponse.json(result);
}

export const POST = withRoutineLog("question-scanner", _POST);
export const GET = POST;

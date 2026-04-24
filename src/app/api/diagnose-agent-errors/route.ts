/**
 * GET/POST /api/diagnose-agent-errors
 *
 * Diagnostic-only agent-health monitor. Reads errored routine_runs from the
 * last 7 days, clusters them by (routine_name, normalized_error_pattern),
 * classifies each cluster with an LLM, and upserts into agent_health_diagnoses.
 *
 * Does NOT write code, restart services, or mutate anything outside the
 * agent_health_diagnoses table. Proposal-only.
 *
 * Existing clusters → bump occurrence_count + last_seen, and reopen if previously
 * resolved (silenced clusters are left alone).
 * New clusters → full LLM classification.
 *
 * Auth: CRON_SECRET (cron path) OR admin session (on-demand trigger).
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { checkIsAdmin } from "@/lib/require-admin";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authOk(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers.get("x-agent-key");
    if (h === secret) return true;
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return await checkIsAdmin();
}

// ─── Error pattern normalization ──────────────────────────────────────────────
//
// Collapses volatile tokens so the same class of failure hashes to one cluster.
// Kept deliberately conservative: we'd rather cluster too coarsely than too
// finely — operators can split later.

function normalizeError(raw: string | null | undefined): string {
  if (!raw) return "(no error message)";
  let s = raw;

  // Drop long "Available options: ..." tails that Notion appends on schema drift.
  s = s.replace(/Available options:[\s\S]*$/i, "Available options: <…>");

  // UUIDs / Notion IDs
  s = s.replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, "<uuid>");
  s = s.replace(/\b[0-9a-f]{32}\b/gi, "<id>");

  // ISO timestamps
  s = s.replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, "<ts>");

  // Emails
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>");

  // URLs
  s = s.replace(/https?:\/\/[^\s"'`<>]+/g, "<url>");

  // Numbers (counters, HTTP, timings). Keep HTTP status codes readable at the
  // edges by leaving the surrounding words; just mask the digits.
  s = s.replace(/\b\d{2,}\b/g, "<n>");

  // Multiple whitespace → single
  s = s.replace(/\s+/g, " ").trim();

  // Cap length — cluster key stability
  if (s.length > 400) s = s.slice(0, 400) + "…";
  return s;
}

function clusterKey(routineName: string, pattern: string): string {
  return crypto
    .createHash("sha1")
    .update(`${routineName}::${pattern}`)
    .digest("hex");
}

// ─── LLM classification ───────────────────────────────────────────────────────

type Classification =
  | "env_missing" | "notion_404" | "schema_drift" | "timeout"
  | "auth_failure" | "rate_limit" | "network" | "unknown";

type Confidence = "low" | "medium" | "high";

type Diagnosis = {
  classification: Classification;
  confidence: Confidence;
  root_cause_hypothesis: string;
  suggested_fix: string;
};

const CLASSIFY_SYSTEM = `You diagnose failed cron job runs from a Next.js backend that talks to Notion, Supabase, Gmail, and Anthropic. For each error cluster you receive:

1) Classify into exactly one of:
   - env_missing      — required env var not set / returning undefined
   - notion_404       — Notion page/db not found or archived
   - schema_drift     — Notion select/status option missing, or property renamed/removed
   - timeout          — handler exceeded maxDuration or upstream call timed out
   - auth_failure     — 401/403 from Notion, Gmail, Supabase, or CRON_SECRET mismatch
   - rate_limit       — 429 or provider throttling
   - network          — DNS/fetch/connection reset, transient
   - unknown          — none of the above fit with confidence

2) Confidence: high / medium / low — how sure are you the classification is right?

3) root_cause_hypothesis: one sentence, concrete. Name the likely Notion property, env var, or API call when possible.

4) suggested_fix: 2-4 short lines of actionable steps. If you can name the file (src/app/api/<routine>/route.ts is the standard location), do. Do not propose code changes — describe what to check and what to change.

Respond with JSON ONLY:
{"classification":"...","confidence":"...","root_cause_hypothesis":"...","suggested_fix":"..."}`;

async function classify(routineName: string, sampleError: string, normalizedPattern: string): Promise<Diagnosis> {
  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0,
      system: CLASSIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Routine: ${routineName}
Route file (likely): src/app/api/${routineName}/route.ts

Sample error (raw):
${sampleError.slice(0, 1200)}

Normalized pattern (for reference):
${normalizedPattern.slice(0, 400)}

Return the JSON diagnosis.`,
        },
      ],
    });
    const block = resp.content[0];
    const text = block?.type === "text" ? block.text : "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON in LLM reply");
    const parsed = JSON.parse(cleaned.slice(start, end + 1));

    const cls = String(parsed.classification ?? "unknown") as Classification;
    const conf = String(parsed.confidence ?? "low") as Confidence;
    const validCls: Classification[] = [
      "env_missing", "notion_404", "schema_drift", "timeout",
      "auth_failure", "rate_limit", "network", "unknown",
    ];
    const validConf: Confidence[] = ["low", "medium", "high"];
    return {
      classification: validCls.includes(cls) ? cls : "unknown",
      confidence: validConf.includes(conf) ? conf : "low",
      root_cause_hypothesis: String(parsed.root_cause_hypothesis ?? "").slice(0, 500),
      suggested_fix: String(parsed.suggested_fix ?? "").slice(0, 1500),
    };
  } catch (e) {
    // LLM failure shouldn't block the run — fall back to unknown/low so the
    // row still appears in the admin UI with the raw pattern.
    return {
      classification: "unknown",
      confidence: "low",
      root_cause_hypothesis:
        "Auto-classification failed: " + (e instanceof Error ? e.message : String(e)),
      suggested_fix: "Review the raw error message manually.",
    };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type ErrRow = {
  routine_name: string;
  status: string;
  http_status: number | null;
  error_message: string | null;
  started_at: string;
};

async function _POST(req: NextRequest) {
  if (!(await authOk(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: errRows, error: readErr } = await sb
    .from("routine_runs")
    .select("routine_name, status, http_status, error_message, started_at")
    .eq("status", "error")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(500);

  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 502 });
  }

  const rows = (errRows ?? []) as ErrRow[];

  // Cluster
  type Cluster = {
    cluster_key: string;
    routine_name: string;
    error_pattern: string;
    sample_error: string;
    occurrence_count: number;
    first_seen: string;
    last_seen: string;
  };
  const clusters = new Map<string, Cluster>();
  for (const r of rows) {
    const pattern = normalizeError(r.error_message);
    const key = clusterKey(r.routine_name, pattern);
    const existing = clusters.get(key);
    if (existing) {
      existing.occurrence_count++;
      if (r.started_at < existing.first_seen) existing.first_seen = r.started_at;
      if (r.started_at > existing.last_seen) existing.last_seen = r.started_at;
    } else {
      clusters.set(key, {
        cluster_key: key,
        routine_name: r.routine_name,
        error_pattern: pattern,
        sample_error: r.error_message ?? "(empty)",
        occurrence_count: 1,
        first_seen: r.started_at,
        last_seen: r.started_at,
      });
    }
  }

  // Load existing rows for these keys in one round trip
  const keys = Array.from(clusters.keys());
  let existingByKey = new Map<string, { status: string; classification: string }>();
  if (keys.length > 0) {
    const { data: existing } = await sb
      .from("agent_health_diagnoses")
      .select("cluster_key, status, classification")
      .in("cluster_key", keys);
    existingByKey = new Map(
      (existing ?? []).map((r) => [
        (r as { cluster_key: string }).cluster_key,
        {
          status: (r as { status: string }).status,
          classification: (r as { classification: string }).classification,
        },
      ])
    );
  }

  let created = 0, updated = 0, reopened = 0, skipped_silenced = 0, llm_calls = 0;

  for (const c of clusters.values()) {
    const prior = existingByKey.get(c.cluster_key);

    if (prior?.status === "silenced") {
      skipped_silenced++;
      continue;
    }

    if (!prior) {
      // New cluster — classify with LLM
      const diag = await classify(c.routine_name, c.sample_error, c.error_pattern);
      llm_calls++;
      const { error } = await sb.from("agent_health_diagnoses").insert({
        cluster_key: c.cluster_key,
        routine_name: c.routine_name,
        error_pattern: c.error_pattern,
        sample_error: c.sample_error.slice(0, 4000),
        classification: diag.classification,
        confidence: diag.confidence,
        root_cause_hypothesis: diag.root_cause_hypothesis,
        suggested_fix: diag.suggested_fix,
        first_seen: c.first_seen,
        last_seen: c.last_seen,
        occurrence_count: c.occurrence_count,
        status: "new",
      });
      if (!error) created++;
    } else {
      // Existing cluster
      const newStatus = prior.status === "resolved" ? "new" : prior.status;
      if (prior.status === "resolved") reopened++;

      const { error } = await sb
        .from("agent_health_diagnoses")
        .update({
          last_seen: c.last_seen,
          occurrence_count: c.occurrence_count,
          sample_error: c.sample_error.slice(0, 4000),
          status: newStatus,
          ...(prior.status === "resolved"
            ? { status_changed_at: new Date().toISOString(), status_changed_by: "auto-reopen" }
            : {}),
        })
        .eq("cluster_key", c.cluster_key);
      if (!error) updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    errors_scanned: rows.length,
    clusters: clusters.size,
    created,
    updated,
    reopened,
    skipped_silenced,
    llm_calls,
  });
}

export const POST = withRoutineLog("diagnose-agent-errors", _POST);
export const GET = POST;

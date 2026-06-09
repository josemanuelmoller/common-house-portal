/**
 * POST /api/extract-meeting-evidence
 *
 * Fetches recent Fireflies transcripts, extracts atomic evidence records
 * (Decisions, Blockers, Outcomes, Requirements, Risks, Dependencies) using
 * Claude Haiku, and writes each to CH Evidence [OS v2] with Validation Status = New.
 *
 * From there the validation-operator and project-operator pick them up automatically.
 *
 * Changes vs v1:
 *   - Auth unified to CRON_SECRET (same pattern as fireflies-sync)
 *   - Deduplication: pre-loads existing evidence titles+dates; skips re-extractions
 *   - CH Projects relation: resolves project ID from title/participant keywords
 *   - PROJECT_MAP covers all 8 garage projects (not just iRefill + SUFI)
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 * Called by Vercel cron daily at 02:00 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";
import { computeAnthropicCost, makeUsageAccumulator, addUsage, type AnthropicUsage } from "@/lib/anthropic-cost";
import { loadEntityIndex, resolveOrgId, resolveProjectId, type EntityIndex } from "@/lib/resolve-meeting-entities";
import { getSelfEmails } from "@/lib/hall-self";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export const maxDuration = 90;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (!expected) return false;
  return (agentKey === expected) || (cronToken === `Bearer ${expected}`);
}

// Org / project mapping is done by `resolve-meeting-entities.ts` using
// Supabase as source of truth. The previous ORG_MAP / PROJECT_MAP dictionaries
// (8 hard-coded "garage" startups) were removed 2026-05-15 — they were the
// reason any client outside that list (e.g. Engatel) silently lost their
// meeting evidence link, because the resolver returned null for them and the
// evidence row was inserted with org_notion_id=NULL.

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirefliesTranscript {
  id:              string;
  title:           string;
  date:            number;
  duration:        number;
  participants:    string[];
  organizer_email: string;
  summary: {
    action_items:     string | null;
    keywords:         string | null;
    shorthand_bullet: string | null;
    overview:         string | null;
  } | null;
}

interface EvidenceItem {
  title:          string;
  type:           string;
  statement:      string;
  excerpt:        string;
  confidence:     string;
  affected_theme: string;
  geography:      string;
  topics:         string[];
  org_name:       string;
}

// ─── Allowed values (Notion select/multi_select) ──────────────────────────────

const VALID_TYPES      = new Set(["Approval","Blocker","Process Step","Stakeholder","Risk","Objection","Decision","Requirement","Dependency","Outcome","Assumption","Contradiction","Insight Candidate"]);
const VALID_THEMES     = new Set(["Approvals","Stakeholders","Operations","Training","Tech","Legal","Procurement","Communications","Rollout","Metrics","Budget","Commercial","Governance"]);
const VALID_GEO        = new Set(["UK","EU","LATAM","North America","Africa / MENA","Asia","Global"]);
const VALID_TOPICS     = new Set(["Refill","Reuse","Zero Waste","Policy","Retail","Organics","Packaging","Cities","Behaviour Change"]);
const VALID_CONFIDENCE = new Set(["High","Medium","Low"]);

const THEME_ALIAS: Record<string, string> = {
  "Tech": "Tech", "Technology": "Tech",
  "Operations": "Operations",
  "Commercial": "Commercial",
  "Legal": "Legal",
  "Procurement": "Procurement",
  "Communications": "Communications",
  "Budget": "Budget",
  "Rollout": "Rollout",
  "Metrics": "Metrics",
  "Stakeholders": "Stakeholders",
  "Governance": "Governance",
  "Training": "Training",
  "Approvals": "Approvals",
};

// Org + project resolution lives in src/lib/resolve-meeting-entities.ts.
// We call resolveOrgId / resolveProjectId per evidence item (org) and per
// transcript (project), passing the LLM-extracted org_name as a hint.

// ─── Deduplication ────────────────────────────────────────────────────────────
// Pre-load evidence titles already captured in the window.
// Key format: "title::date" (lowercase title to handle minor casing variance).

async function loadExistingEvidenceKeys(fromDateStr: string): Promise<Set<string>> {
  const existing = new Set<string>();

  // Supabase canonical (Notion fallback removed 2026-05-15, post Phase 2 backfill).
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("evidence")
      .select("title, date_captured")
      .eq("legacy_source_db", "Meetings [master]")
      .gte("date_captured", fromDateStr)
      .limit(2000);
    for (const row of (data ?? []) as { title: string | null; date_captured: string | null }[]) {
      if (row.title && row.date_captured) existing.add(`${row.title.toLowerCase()}::${row.date_captured}`);
    }
  } catch { /* non-fatal — if query fails, dedup is skipped */ }
  return existing;
}

// ─── Fireflies fetch ──────────────────────────────────────────────────────────

async function fetchTranscripts(fromDate: Date): Promise<FirefliesTranscript[]> {
  const query = `
    query RecentTranscripts($fromDate: DateTime) {
      transcripts(fromDate: $fromDate, limit: 20) {
        id title date duration participants organizer_email
        summary { action_items keywords shorthand_bullet overview }
      }
    }
  `;

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({ query, variables: { fromDate: fromDate.toISOString() } }),
  });

  if (!res.ok) throw new Error(`Fireflies error: ${res.status}`);
  const json = await res.json();
  return (json?.data?.transcripts ?? []) as FirefliesTranscript[];
}

// ─── Evidence extraction ──────────────────────────────────────────────────────

async function extractEvidence(t: FirefliesTranscript, usageAcc?: AnthropicUsage): Promise<EvidenceItem[]> {
  const dateStr = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const prompt = `Extract 3-6 atomic evidence records from this meeting for a portfolio management OS.

Meeting: ${t.title}
Date: ${dateStr}
Participants: ${t.participants.join(", ")}
Summary: ${t.summary?.overview || t.summary?.shorthand_bullet || "none"}
Action items: ${t.summary?.action_items || "none"}

Language rule (IMPORTANT):
- Write "title", "statement", and "excerpt" in the SAME language as the meeting. If the source summary/action items are in Spanish, return Spanish. If English, English. If mixed, use whichever language dominates. Do not translate.
- Preserve original phrasing and nuance.
- "type", "affected_theme", "geography", "topics", "confidence" stay in English (controlled vocabularies).

Rules:
- Each item is ONE atomic fact: a decision made, blocker identified, outcome achieved, requirement defined, risk flagged, or dependency created
- Skip vague plans, scheduling, and meta-conversation
- Be specific and factual — cite what was actually decided/blocked/achieved

Return ONLY a JSON array:
[
  {
    "title": "Short factual title max 80 chars starting with the key fact, in the meeting language",
    "type": "Decision|Blocker|Outcome|Requirement|Dependency|Risk|Process Step",
    "statement": "1-2 sentence factual description with specifics, in the meeting language",
    "excerpt": "Most relevant direct quote or paraphrase (verbatim), max 100 chars",
    "confidence": "High|Medium|Low",
    "affected_theme": "Operations|Tech|Commercial|Legal|Procurement|Communications|Budget|Rollout|Metrics|Stakeholders|Governance",
    "geography": "UK|EU|LATAM|North America|Africa / MENA|Asia|Global",
    "topics": ["Refill","Retail","Packaging","Reuse","Zero Waste","Policy"],
    "org_name": "Name of the startup or company this is primarily about"
  }
]`;

  const msg = await anthropic.messages.create({
    model:      HAIKU_MODEL,
    max_tokens: 1800,
    messages:   [{ role: "user", content: prompt }],
  });
  if (usageAcc) addUsage(usageAcc, msg.usage);

  const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  const match   = rawText.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    return JSON.parse(match[0]) as EvidenceItem[];
  } catch {
    return [];
  }
}

// ─── Write to Notion ──────────────────────────────────────────────────────────

async function writeEvidence(
  item:      EvidenceItem,
  dateStr:   string,
  orgId:     string | null,
  projectId: string | null,
  sourceId:  string | null,
): Promise<string> {
  const evidenceType = VALID_TYPES.has(item.type) ? item.type : "Outcome";
  const confidence   = VALID_CONFIDENCE.has(item.confidence) ? item.confidence : "Medium";
  const geo          = VALID_GEO.has(item.geography) ? item.geography : null;
  const theme        = THEME_ALIAS[item.affected_theme];
  const validTopics  = (item.topics ?? []).filter(t => VALID_TOPICS.has(t));

  // notion-cutoff-2026-06-02: replaced by canonical write to evidence
  // const properties = {
  //   "Evidence Title":     { title:     [{ text: { content: item.title.slice(0, 100) } }] },
  //   "Evidence Type":      { select:    { name: evidenceType } },
  //   "Evidence Statement": { rich_text: [{ text: { content: item.statement.slice(0, 2000) } }] },
  //   "Source Excerpt":     { rich_text: [{ text: { content: item.excerpt.slice(0, 500) } }] },
  //   "Validation Status":  { select:    { name: "New" } },
  //   "Confidence Level":   { select:    { name: confidence } },
  //   "Sensitivity Level":  { select:    { name: "Internal" } },
  //   "Legacy Source DB":   { select:    { name: "Meetings [master]" } },
  //   "Date Captured":      { date:      { start: dateStr } },
  //   "Affected Theme" / "Geography" / "Topics / Themes" / "Organization" / "Project" — conditional
  // };
  // const page = await notion.pages.create({ parent: { database_id: EVIDENCE_DB }, properties });
  // return page.id;
  //
  // Notion → Supabase (evidence) column mapping:
  //   Evidence Title     → title
  //   Evidence Type      → evidence_type
  //   Evidence Statement → evidence_statement
  //   Source Excerpt     → source_excerpt
  //   Validation Status  → validation_status
  //   Confidence Level   → confidence_level
  //   Sensitivity Level  → sensitivity_level
  //   Legacy Source DB   → legacy_source_db
  //   Date Captured      → date_captured
  //   Affected Theme     → affected_theme
  //   Geography          → geography
  //   Topics / Themes    → topics (text-comma-joined; existing column is text)
  //   Organization       → org_notion_id
  //   Project            → project_notion_id
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("evidence")
    .insert({
      title:               item.title.slice(0, 100),
      evidence_type:       evidenceType,
      evidence_statement:  item.statement.slice(0, 2000),
      source_excerpt:      item.excerpt.slice(0, 500),
      validation_status:   "New",
      confidence_level:    confidence,
      sensitivity_level:   "Internal",
      legacy_source_db:    "Meetings [master]",
      date_captured:       dateStr,
      affected_theme:      (theme && VALID_THEMES.has(theme)) ? theme : null,
      geography:           geo,
      topics:              validTopics.length > 0 ? validTopics.join(", ") : null,
      org_notion_id:       orgId,
      project_notion_id:   projectId,
      // Stable FK back to the Fireflies meeting source. Without this the
      // Fireflies action-item ingestor cannot find this evidence and the
      // Hall "Commitments" surface stays empty.
      source_id:           sourceId,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`evidence insert failed: ${error.message}`);
  }
  return (data?.id as string) ?? "";
}

// ─── Source find-or-create ────────────────────────────────────────────────────
// Each transcript must have a row in `sources` so evidence can FK to it.
// fireflies-sync also creates these (and enriches with project links), but it
// runs hours later AND only for transcripts that match a project — so this
// extractor owns "ensure the source exists". Keyed on source_external_id (the
// Fireflies transcript id), which is stable and always present, unlike notion_id.

async function ensureFirefliesSource(
  t: FirefliesTranscript,
  orgId: string | null,
  projectId: string | null,
): Promise<string | null> {
  const sb = getSupabaseServerClient();

  const { data: existing } = await sb
    .from("sources")
    .select("id, org_notion_id, project_notion_id")
    .eq("source_external_id", t.id)
    .maybeSingle();
  if (existing?.id) {
    // Existing row may have been created earlier without org/project (e.g.
    // by a pre-resolver run). Patch the link forward whenever we now have
    // a resolution but the stored row does not.
    const patch: Record<string, string> = {};
    const existingRow = existing as { id: string; org_notion_id: string | null; project_notion_id: string | null };
    if (orgId     && !existingRow.org_notion_id)     patch.org_notion_id     = orgId;
    if (projectId && !existingRow.project_notion_id) patch.project_notion_id = projectId;
    if (Object.keys(patch).length > 0) {
      await sb.from("sources").update(patch).eq("id", existingRow.id);
    }
    return existingRow.id;
  }

  const meetingDate = new Date(t.date).toISOString().slice(0, 10);
  const summary     = t.summary?.overview || t.summary?.shorthand_bullet || "";
  const { data: created, error } = await sb
    .from("sources")
    .insert({
      title:              t.title.slice(0, 200),
      source_type:        "Meeting",
      source_platform:    "Fireflies",
      processing_status:  "Processed",
      source_date:        meetingDate,
      // Same viewer URL format fireflies-sync uses — keeps its URL-based
      // dedup consistent so it does not create a duplicate row later.
      source_url:         `https://app.fireflies.ai/view/${t.id}`,
      org_notion_id:      orgId,
      project_notion_id:  projectId,
      processed_summary:  summary ? summary.slice(0, 2000) : null,
      dedup_key:          `fireflies:${t.id}`,
      source_external_id: t.id,
    })
    .select("id")
    .single();

  if (error) {
    // Unique-violation race (another writer created it first) — re-select.
    const { data: raced } = await sb
      .from("sources")
      .select("id")
      .eq("source_external_id", t.id)
      .maybeSingle();
    return (raced as { id: string } | null)?.id ?? null;
  }
  return (created as { id: string } | null)?.id ?? null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body      = await req.text();
    const params    = body ? JSON.parse(body) : {};
    const hoursBack = params.hoursBack ?? 24;
    const now       = new Date();
    const fromDate  = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const fromStr   = fromDate.toISOString().slice(0, 10);
    const today     = now.toISOString().slice(0, 10);

    // 1. Pre-load existing evidence keys for deduplication
    const existingKeys = await loadExistingEvidenceKeys(fromStr);

    // 2. Fetch transcripts
    const transcripts = await fetchTranscripts(fromDate);

    if (transcripts.length === 0) {
      return NextResponse.json({ ok: true, meetings: 0, evidence_written: 0, skipped: 0, cost_usd: 0, message: "No new meetings in window" });
    }

    // 3. Load the Supabase entity index + self-identity set once.
    //    resolveOrgId / resolveProjectId are pure-function lookups against
    //    this in-memory snapshot. Self emails are excluded from the primary
    //    org match so a Jose-hosted meeting resolves to the counterpart
    //    org rather than Common House.
    const sb: ReturnType<typeof getSupabaseServerClient> = getSupabaseServerClient();
    const [idx, selfEmails]: [EntityIndex, Set<string>] = await Promise.all([
      loadEntityIndex(sb),
      getSelfEmails(),
    ]);

    const usageAcc = makeUsageAccumulator();
    const results: { meetingTitle: string; evidenceCount: number; skipped: number; orgPath: string; projPath: string; ids: string[] }[] = [];
    const errors:  string[] = [];

    // 4. Process each transcript
    for (const t of transcripts) {
      try {
        const items     = await extractEvidence(t, usageAcc);
        const dateStr   = new Date(t.date).toISOString().slice(0, 10);
        // Project is resolved per transcript (one project per meeting).
        // Org is resolved per evidence item below, falling back to the
        // transcript-level org so unmatched LLM org_name strings still get
        // linked correctly via participants.
        const transcriptOrg = resolveOrgId(idx, {
          title: t.title,
          participantEmails: t.participants,
          selfEmails,
        });
        const projResult = resolveProjectId(idx, transcriptOrg.orgNotionId, { title: t.title });
        // Ensure the meeting has a `sources` row so evidence can FK to it,
        // and patch in org/project links if the row predates the resolver.
        const sourceId  = await ensureFirefliesSource(t, transcriptOrg.orgNotionId, projResult.projectNotionId);
        const ids:      string[] = [];
        let   skipped   = 0;

        for (const item of items) {
          try {
            const key = `${item.title.toLowerCase()}::${dateStr}`;
            if (existingKeys.has(key)) { skipped++; continue; }

            // Org resolution per item: use the LLM-extracted org_name as a
            // hint, but if that does not resolve, fall back to the
            // transcript-level org (participants are the strongest signal).
            const itemOrg = resolveOrgId(idx, {
              title: t.title,
              participantEmails: t.participants,
              orgNameHint: item.org_name,
              selfEmails,
            });
            const orgId = itemOrg.orgNotionId ?? transcriptOrg.orgNotionId;
            const id    = await writeEvidence(item, dateStr, orgId, projResult.projectNotionId, sourceId);
            existingKeys.add(key);
            ids.push(id);
          } catch (e) {
            errors.push(`${t.title} / "${item.title}": ${String(e)}`);
          }
        }

        results.push({
          meetingTitle:  t.title,
          evidenceCount: ids.length,
          skipped,
          orgPath:       transcriptOrg.matchPath,
          projPath:      projResult.matchPath,
          ids,
        });
      } catch (e) {
        errors.push(`${t.title}: ${String(e)}`);
      }
    }

    const totalEvidence = results.reduce((s, r) => s + r.evidenceCount, 0);
    const totalSkipped  = results.reduce((s, r) => s + r.skipped, 0);

    const cost_usd = computeAnthropicCost(usageAcc, HAIKU_MODEL);

    return NextResponse.json({
      ok:               true,
      meetings:         transcripts.length,
      evidence_written: totalEvidence,
      skipped:          totalSkipped,
      cost_usd,
      results,
      errors,
      window:           `${fromDate.toISOString()} → ${now.toISOString()}`,
      date:             today,
    });

  } catch (e) {
    console.error("extract-meeting-evidence error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const POST = withRoutineLog("extract-meeting-evidence", _POST);
// Allow Vercel cron (GET) to trigger
export const GET = POST;

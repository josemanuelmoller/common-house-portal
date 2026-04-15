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
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 90;

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const EVIDENCE_DB   = "fa28124978d043039d8932ac9964ccf5";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  return (agentKey === expected) || (cronToken === `Bearer ${expected}`);
}

// ─── CH Organization IDs (for "Organization" relation on evidence) ────────────
// Key = display name, notionId = CH Organizations [OS v2] page ID (no dashes)

const ORG_MAP: Record<string, { notionId: string; keywords: string[]; emailDomains: string[] }> = {
  "iRefill": {
    notionId:     "33f45e5b-6633-810b-95ea-fddc3219b71a",
    keywords:     ["irefill", "airefil", "refill", "rajneesh", "auto mercado", "automercado", "dispensadora"],
    emailDomains: ["irefill.in", "automercado.biz"],
  },
  "SUFI": {
    notionId:     "33f45e5b-6633-81b3-84ef-fa1ad08b091b",
    keywords:     ["sufi", "andresalejandrobarbieri"],
    emailDomains: [],
  },
  "Way Out": {
    notionId:     "33f45e5b-6633-81cd-9e1b-df610a9ff5dc",
    keywords:     ["wayout", "way out"],
    emailDomains: [],
  },
  "Beeok": {
    notionId:     "33f45e5b-6633-818a-ad5b-c387eac4dff7",
    keywords:     ["beeok"],
    emailDomains: [],
  },
  "Yenxa": {
    notionId:     "33f45e5b-6633-8110-8260-dfe9a94ef4e8",
    keywords:     ["yenxa"],
    emailDomains: [],
  },
  "Moss Solutions": {
    notionId:     "33f45e5b-6633-811a-ab3d-ea9e39d97a11",
    keywords:     ["moss solutions", "moss"],
    emailDomains: [],
  },
  "GotoFly": {
    notionId:     "33f45e5b-6633-81df-8654-cc715a5bb81e",
    keywords:     ["gotofly", "goto fly"],
    emailDomains: [],
  },
  "Movener": {
    notionId:     "33f45e5b-6633-8153-93d1-f86985420a9e",
    keywords:     ["movener"],
    emailDomains: [],
  },
};

// ─── CH Project IDs (for "Project" relation on evidence) ─────────────────────
// Covers all 8 garage startups. Keywords match meeting titles + participant emails.

const PROJECT_MAP: Record<string, { projectId: string; keywords: string[]; emailDomains: string[] }> = {
  "iRefill": {
    projectId:    "33f45e5b-6633-81f6-9b68-d898237d6533",
    keywords:     ["irefill", "airefil", "refill", "rajneesh", "auto mercado", "automercado", "dispensadora"],
    emailDomains: ["irefill.in", "automercado.biz"],
  },
  "SUFI": {
    projectId:    "33f45e5b-6633-81f4-bde2-f97d7a11bfb3",
    keywords:     ["sufi", "andresalejandrobarbieri"],
    emailDomains: [],
  },
  "Way Out": {
    projectId:    "33f45e5b-6633-8129-b715-ea38f400d631",
    keywords:     ["wayout", "way out"],
    emailDomains: [],
  },
  "Beeok": {
    projectId:    "33f45e5b-6633-8124-b2b8-c79d18a4d46a",
    keywords:     ["beeok"],
    emailDomains: [],
  },
  "Yenxa": {
    projectId:    "33f45e5b-6633-812a-9b42-faf1f0b2518b",
    keywords:     ["yenxa"],
    emailDomains: [],
  },
  "Moss Solutions": {
    projectId:    "33f45e5b-6633-8138-937a-f600fc992756",
    keywords:     ["moss solutions", "moss"],
    emailDomains: [],
  },
  "GotoFly": {
    projectId:    "33f45e5b-6633-814e-8d18-e3c96a8d20ca",
    keywords:     ["gotofly", "goto fly"],
    emailDomains: [],
  },
  "Movener": {
    projectId:    "33f45e5b-6633-810b-81d1-e22915da2506",
    keywords:     ["movener"],
    emailDomains: [],
  },
};

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

// ─── Org + Project resolution ─────────────────────────────────────────────────

function resolveOrg(orgHint: string, participants: string[]): string | null {
  const hint   = orgHint.toLowerCase();
  const emails = participants.join(" ").toLowerCase();
  for (const org of Object.values(ORG_MAP)) {
    if (org.keywords.some(k => hint.includes(k) || emails.includes(k))) return org.notionId;
    if (org.emailDomains.some(d => emails.includes(d)))                  return org.notionId;
  }
  return null;
}

function resolveProject(transcriptTitle: string, participants: string[]): string | null {
  const title  = transcriptTitle.toLowerCase();
  const emails = participants.join(" ").toLowerCase();
  for (const proj of Object.values(PROJECT_MAP)) {
    if (proj.keywords.some(k => title.includes(k) || emails.includes(k))) return proj.projectId;
    if (proj.emailDomains.some(d => emails.includes(d)))                   return proj.projectId;
  }
  return null;
}

// ─── Deduplication ────────────────────────────────────────────────────────────
// Pre-load evidence titles already captured in the window.
// Key format: "title::date" (lowercase title to handle minor casing variance).

async function loadExistingEvidenceKeys(fromDateStr: string): Promise<Set<string>> {
  const existing = new Set<string>();
  try {
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: EVIDENCE_DB,
        filter: {
          and: [
            { property: "Date Captured",   date:      { on_or_after: fromDateStr } },
            { property: "Legacy Source DB", select:    { equals: "Meetings [master]" } },
          ],
        },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const page of res.results as any[]) {
        const title = page.properties?.["Evidence Title"]?.title?.[0]?.plain_text ?? "";
        const date  = page.properties?.["Date Captured"]?.date?.start ?? "";
        if (title && date) existing.add(`${title.toLowerCase()}::${date}`);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  } catch { /* non-critical — if query fails, dedup is skipped */ }
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

async function extractEvidence(t: FirefliesTranscript): Promise<EvidenceItem[]> {
  const dateStr = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const prompt = `Extract 3-6 atomic evidence records from this meeting for a portfolio management OS.

Meeting: ${t.title}
Date: ${dateStr}
Participants: ${t.participants.join(", ")}
Summary: ${t.summary?.overview || t.summary?.shorthand_bullet || "none"}
Action items: ${t.summary?.action_items || "none"}

Rules:
- Each item is ONE atomic fact: a decision made, blocker identified, outcome achieved, requirement defined, risk flagged, or dependency created
- Skip vague plans, scheduling, and meta-conversation
- Be specific and factual — cite what was actually decided/blocked/achieved

Return ONLY a JSON array:
[
  {
    "title": "Short factual title max 80 chars starting with the key fact",
    "type": "Decision|Blocker|Outcome|Requirement|Dependency|Risk|Process Step",
    "statement": "1-2 sentence factual description with specifics",
    "excerpt": "Most relevant direct quote or paraphrase, max 100 chars",
    "confidence": "High|Medium|Low",
    "affected_theme": "Operations|Tech|Commercial|Legal|Procurement|Communications|Budget|Rollout|Metrics|Stakeholders|Governance",
    "geography": "UK|EU|LATAM|North America|Africa / MENA|Asia|Global",
    "topics": ["Refill","Retail","Packaging","Reuse","Zero Waste","Policy"],
    "org_name": "Name of the startup or company this is primarily about"
  }
]`;

  const msg = await anthropic.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 1800,
    messages:   [{ role: "user", content: prompt }],
  });

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
): Promise<string> {
  const evidenceType = VALID_TYPES.has(item.type) ? item.type : "Outcome";
  const confidence   = VALID_CONFIDENCE.has(item.confidence) ? item.confidence : "Medium";
  const geo          = VALID_GEO.has(item.geography) ? item.geography : null;
  const theme        = THEME_ALIAS[item.affected_theme];
  const validTopics  = (item.topics ?? []).filter(t => VALID_TOPICS.has(t));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Evidence Title":     { title:     [{ text: { content: item.title.slice(0, 100) } }] },
    "Evidence Type":      { select:    { name: evidenceType } },
    "Evidence Statement": { rich_text: [{ text: { content: item.statement.slice(0, 2000) } }] },
    "Source Excerpt":     { rich_text: [{ text: { content: item.excerpt.slice(0, 500) } }] },
    "Validation Status":  { select:    { name: "New" } },
    "Confidence Level":   { select:    { name: confidence } },
    "Sensitivity Level":  { select:    { name: "Internal" } },
    "Legacy Source DB":   { select:    { name: "Meetings [master]" } },
    "Date Captured":      { date:      { start: dateStr } },
  };

  if (theme && VALID_THEMES.has(theme)) {
    properties["Affected Theme"] = { multi_select: [{ name: theme }] };
  }
  if (geo) {
    properties["Geography"] = { multi_select: [{ name: geo }] };
  }
  if (validTopics.length > 0) {
    properties["Topics / Themes"] = { multi_select: validTopics.map(t => ({ name: t })) };
  }
  if (orgId) {
    properties["Organization"] = { relation: [{ id: orgId }] };
  }
  if (projectId) {
    properties["Project"] = { relation: [{ id: projectId }] };
  }

  const page = await notion.pages.create({
    parent: { database_id: EVIDENCE_DB },
    properties,
  });

  return page.id;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ ok: true, meetings: 0, evidence_written: 0, skipped: 0, message: "No new meetings in window" });
    }

    const results: { meetingTitle: string; evidenceCount: number; skipped: number; ids: string[] }[] = [];
    const errors:  string[] = [];

    // 3. Process each transcript
    for (const t of transcripts) {
      try {
        const items     = await extractEvidence(t);
        const dateStr   = new Date(t.date).toISOString().slice(0, 10);
        const projectId = resolveProject(t.title, t.participants);
        const ids:      string[] = [];
        let   skipped   = 0;

        for (const item of items) {
          try {
            // Dedup check: skip if we already have this title on this date
            const key = `${item.title.toLowerCase()}::${dateStr}`;
            if (existingKeys.has(key)) { skipped++; continue; }

            const orgId = resolveOrg(item.org_name, t.participants);
            const id    = await writeEvidence(item, dateStr, orgId, projectId);
            existingKeys.add(key); // prevent within-run duplicates
            ids.push(id);
          } catch (e) {
            errors.push(`${t.title} / "${item.title}": ${String(e)}`);
          }
        }

        results.push({ meetingTitle: t.title, evidenceCount: ids.length, skipped, ids });
      } catch (e) {
        errors.push(`${t.title}: ${String(e)}`);
      }
    }

    const totalEvidence = results.reduce((s, r) => s + r.evidenceCount, 0);
    const totalSkipped  = results.reduce((s, r) => s + r.skipped, 0);

    return NextResponse.json({
      ok:               true,
      meetings:         transcripts.length,
      evidence_written: totalEvidence,
      skipped:          totalSkipped,
      results,
      errors,
      window:           `${fromDate.toISOString()} → ${now.toISOString()}`,
      date:             today,
    });

  } catch (e) {
    console.error("extract-meeting-evidence error:", e);
    return NextResponse.json({ error: "Internal error", detail: String(e) }, { status: 500 });
  }
}

// Allow Vercel cron (GET) to trigger
export async function GET(req: NextRequest) {
  return POST(req);
}

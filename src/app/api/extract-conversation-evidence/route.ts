/**
 * POST /api/extract-conversation-evidence
 *
 * Extracts atomic evidence records (Decisions, Blockers, Outcomes,
 * Requirements, Dependencies, Risks, Process Steps) from WhatsApp
 * conversation clips captured via the Clipper extension.
 *
 * Parallel to /api/extract-meeting-evidence but sourced from Supabase
 * (sources + conversation_messages) rather than the Fireflies API.
 *
 * Triggered by:
 *   - Fire-and-forget call from /api/clipper on successful WA clip (body:
 *     { source_id }) so evidence surfaces minutes after the clip, not the
 *     next day.
 *   - A future cron sweep (no source_id → process every WA source with
 *     evidence_extracted=false in the last 48h).
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EVIDENCE_DB = "fa28124978d043039d8932ac9964ccf5";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  return (agentKey === expected) || (cronToken === `Bearer ${expected}`);
}

// ─── Org + Project hint maps (mirrored from extract-meeting-evidence) ────────

const ORG_MAP: Record<string, { notionId: string; keywords: string[]; emailDomains: string[] }> = {
  "iRefill":        { notionId: "33f45e5b-6633-810b-95ea-fddc3219b71a", keywords: ["irefill","airefil","refill","rajneesh","auto mercado","automercado","dispensadora"], emailDomains: ["irefill.in","automercado.biz"] },
  "SUFI":           { notionId: "33f45e5b-6633-81b3-84ef-fa1ad08b091b", keywords: ["sufi","andresalejandrobarbieri"], emailDomains: [] },
  "Way Out":        { notionId: "33f45e5b-6633-81cd-9e1b-df610a9ff5dc", keywords: ["wayout","way out"], emailDomains: [] },
  "Beeok":          { notionId: "33f45e5b-6633-818a-ad5b-c387eac4dff7", keywords: ["beeok"], emailDomains: [] },
  "Yenxa":          { notionId: "33f45e5b-6633-8110-8260-dfe9a94ef4e8", keywords: ["yenxa"], emailDomains: [] },
  "Moss Solutions": { notionId: "33f45e5b-6633-811a-ab3d-ea9e39d97a11", keywords: ["moss solutions","moss"], emailDomains: [] },
  "GotoFly":        { notionId: "33f45e5b-6633-81df-8654-cc715a5bb81e", keywords: ["gotofly","goto fly"], emailDomains: [] },
  "Movener":        { notionId: "33f45e5b-6633-81c7-8aa7-d0c9a30d40d2", keywords: ["movener"], emailDomains: [] },
};

const PROJECT_MAP: Record<string, { projectId: string; keywords: string[]; emailDomains: string[] }> = {
  "iRefill":        { projectId: "33f45e5b-6633-81a1-b61f-d66c6cb52e55", keywords: ["irefill","auto mercado","refill"], emailDomains: ["irefill.in","automercado.biz"] },
  "SUFI":           { projectId: "33f45e5b-6633-8181-855d-e9eaf1c9b930", keywords: ["sufi"], emailDomains: [] },
  "Way Out":        { projectId: "33f45e5b-6633-8129-b715-ea38f400d631", keywords: ["wayout","way out"], emailDomains: [] },
  "Beeok":          { projectId: "33f45e5b-6633-8124-b2b8-c79d18a4d46a", keywords: ["beeok"], emailDomains: [] },
  "Yenxa":          { projectId: "33f45e5b-6633-812a-9b42-faf1f0b2518b", keywords: ["yenxa"], emailDomains: [] },
  "Moss Solutions": { projectId: "33f45e5b-6633-8138-937a-f600fc992756", keywords: ["moss solutions","moss"], emailDomains: [] },
  "GotoFly":        { projectId: "33f45e5b-6633-814e-8d18-e3c96a8d20ca", keywords: ["gotofly","goto fly"], emailDomains: [] },
  "Movener":        { projectId: "33f45e5b-6633-810b-81d1-e22915da2506", keywords: ["movener"], emailDomains: [] },
};

function resolveOrg(hay: string): string | null {
  const h = hay.toLowerCase();
  for (const org of Object.values(ORG_MAP)) {
    if (org.keywords.some(k => h.includes(k)) || org.emailDomains.some(d => h.includes(d))) return org.notionId;
  }
  return null;
}
function resolveProject(hay: string): string | null {
  const h = hay.toLowerCase();
  for (const proj of Object.values(PROJECT_MAP)) {
    if (proj.keywords.some(k => h.includes(k)) || proj.emailDomains.some(d => h.includes(d))) return proj.projectId;
  }
  return null;
}

// ─── Allowed values ──────────────────────────────────────────────────────────

const VALID_TYPES      = new Set(["Approval","Blocker","Process Step","Stakeholder","Risk","Objection","Decision","Requirement","Dependency","Outcome","Assumption","Contradiction","Insight Candidate"]);
const VALID_THEMES     = new Set(["Approvals","Stakeholders","Operations","Training","Tech","Legal","Procurement","Communications","Rollout","Metrics","Budget","Commercial","Governance"]);
const VALID_GEO        = new Set(["UK","EU","LATAM","North America","Africa / MENA","Asia","Global"]);
const VALID_TOPICS     = new Set(["Refill","Reuse","Zero Waste","Policy","Retail","Organics","Packaging","Cities","Behaviour Change"]);
const VALID_CONFIDENCE = new Set(["High","Medium","Low"]);

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

// ─── Supabase source fetch ───────────────────────────────────────────────────

type WaSource = {
  id:               string;
  notion_id:        string | null;
  title:            string;
  source_date:      string | null;
  source_url:       string | null;
  raw_content:      string | null;
  project_notion_id: string | null;
  org_notion_id:    string | null;
};

async function fetchWaSources(sourceId: string | null, hoursBack: number): Promise<WaSource[]> {
  const sb = getSupabase();
  let q = sb
    .from("sources")
    .select("id, notion_id, title, source_date, source_url, raw_content, project_notion_id, org_notion_id, evidence_extracted, source_platform, created_at")
    .eq("source_platform", "WhatsApp");
  if (sourceId) {
    q = q.eq("id", sourceId);
  } else {
    const since = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
    q = q.eq("evidence_extracted", false).gte("created_at", since).order("created_at", { ascending: false }).limit(25);
  }
  const { data, error } = await q;
  if (error) throw new Error("Supabase sources fetch: " + error.message);
  type Row = WaSource & { evidence_extracted: boolean; source_platform: string; created_at: string };
  return ((data ?? []) as Row[])
    .filter(r => r.raw_content && r.raw_content.length > 100)
    .map(({ evidence_extracted: _e, source_platform: _p, created_at: _c, ...rest }) => {
      void _e; void _p; void _c;
      return rest as WaSource;
    });
}

// ─── Evidence extraction prompt ─────────────────────────────────────────────

async function extractConversationEvidence(src: WaSource): Promise<EvidenceItem[]> {
  // Trim raw_content — Haiku has 200k context but we want focused input.
  // The clipper already produced a nicely-formatted dump. Keep it whole when
  // possible, else cap at 25k chars.
  const content = (src.raw_content ?? "").slice(0, 25000);

  const prompt = `You extract atomic evidence records from a WhatsApp conversation captured by a portfolio management operating system.

Conversation title: ${src.title}
Date: ${src.source_date ?? "unknown"}

Rules:
- Each record is ONE atomic fact: a decision made, commitment assumed, blocker raised, outcome achieved, requirement defined, risk flagged, or process step agreed.
- Skip casual chat, greetings, emoji-only messages, scheduling unless the scheduled topic itself is substantive.
- Cite who said what, specifically. Use names from the messages.
- For commitments ("te mando", "me respondes"), prefer type "Process Step" with the actor's name in the statement.
- Be conservative: 1–4 records is better than 8 fluffy ones. If nothing substantive, return [].

Conversation:
${content}

Return ONLY a JSON array (no markdown, no code fences):
[
  {
    "title":          "Short factual title, max 80 chars",
    "type":           "Decision|Blocker|Outcome|Requirement|Dependency|Risk|Process Step",
    "statement":      "1–2 sentences, factual, cite who said/decided/committed",
    "excerpt":        "Most relevant direct quote from the conversation, max 120 chars",
    "confidence":     "High|Medium|Low",
    "affected_theme": "Operations|Tech|Commercial|Legal|Procurement|Communications|Budget|Rollout|Metrics|Stakeholders|Governance",
    "geography":      "UK|EU|LATAM|North America|Africa / MENA|Asia|Global",
    "topics":         ["Refill","Retail","Packaging","Reuse","Zero Waste","Policy"],
    "org_name":       "Name of the org this is primarily about, or empty"
  }
]`;

  const msg = await anthropic.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 2200,
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

// ─── Dedup: pre-load existing evidence titles for this source ───────────────

async function loadExistingTitles(sourceNotionId: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!sourceNotionId) return out;
  try {
    const res = await notion.databases.query({
      database_id: EVIDENCE_DB,
      filter: { property: "Source", relation: { contains: sourceNotionId } },
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const page of res.results as any[]) {
      const title = page.properties?.["Evidence Title"]?.title?.[0]?.plain_text ?? "";
      if (title) out.add(title.toLowerCase());
    }
  } catch { /* non-fatal */ }
  return out;
}

// ─── Write evidence to Notion ───────────────────────────────────────────────

async function writeEvidence(
  item:      EvidenceItem,
  dateStr:   string,
  sourceNotionId: string | null,
  orgId:     string | null,
  projectId: string | null,
): Promise<string> {
  const type       = VALID_TYPES.has(item.type) ? item.type : "Outcome";
  const confidence = VALID_CONFIDENCE.has(item.confidence) ? item.confidence : "Medium";
  const geo        = VALID_GEO.has(item.geography) ? item.geography : null;
  const theme      = VALID_THEMES.has(item.affected_theme) ? item.affected_theme : null;
  const topics     = (item.topics ?? []).filter(t => VALID_TOPICS.has(t));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Evidence Title":     { title:     [{ text: { content: item.title.slice(0, 100) } }] },
    "Evidence Type":      { select:    { name: type } },
    "Evidence Statement": { rich_text: [{ text: { content: item.statement.slice(0, 2000) } }] },
    "Source Excerpt":     { rich_text: [{ text: { content: item.excerpt.slice(0, 500) } }] },
    "Validation Status":  { select:    { name: "New" } },
    "Confidence Level":   { select:    { name: confidence } },
    "Sensitivity Level":  { select:    { name: "Internal" } },
    "Legacy Source DB":   { select:    { name: "CH Sources [OS v2]" } },
    "Date Captured":      { date:      { start: dateStr } },
  };
  if (theme)       properties["Affected Theme"]  = { multi_select: [{ name: theme }] };
  if (geo)         properties["Geography"]       = { multi_select: [{ name: geo }] };
  if (topics.length) properties["Topics / Themes"] = { multi_select: topics.map(t => ({ name: t })) };
  if (sourceNotionId) properties["Source"]      = { relation: [{ id: sourceNotionId }] };
  if (orgId)       properties["Organization"]    = { relation: [{ id: orgId }] };
  if (projectId)   properties["Project"]         = { relation: [{ id: projectId }] };

  const page = await notion.pages.create({ parent: { database_id: EVIDENCE_DB }, properties });
  return page.id;
}

async function markSourceExtracted(sourceId: string, notionId: string | null) {
  const sb = getSupabase();
  try {
    await sb.from("sources").update({ evidence_extracted: true }).eq("id", sourceId);
  } catch { /* non-fatal */ }
  if (notionId) {
    try {
      await notion.pages.update({
        page_id: notionId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: { "Evidence Extracted?": { checkbox: true } } as any,
      });
    } catch { /* field may not exist in every schema revision */ }
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body     = await req.text();
    const params   = body ? JSON.parse(body) : {};
    const sourceId = (params.source_id as string | undefined) ?? null;
    const hoursBack = (params.hoursBack as number | undefined) ?? 48;

    const sources = await fetchWaSources(sourceId, hoursBack);
    if (sources.length === 0) {
      return NextResponse.json({ ok: true, sources: 0, evidence_written: 0, message: "No pending WA sources in window" });
    }

    const results: { title: string; evidenceCount: number; skipped: number; ids: string[] }[] = [];
    const errors:  string[] = [];
    let totalEvidence = 0;
    let totalSkipped  = 0;

    for (const src of sources) {
      try {
        const items = await extractConversationEvidence(src);
        const dateStr  = src.source_date ?? new Date().toISOString().slice(0, 10);
        const existing = await loadExistingTitles(src.notion_id);

        // Inherit org/project from the source if set; otherwise resolve from title + content
        const srcHay   = (src.title + " " + (src.raw_content ?? "").slice(0, 2000)).toLowerCase();
        const orgId    = src.org_notion_id     ?? resolveOrg(srcHay);
        const defaultProj = src.project_notion_id ?? resolveProject(srcHay);

        const ids: string[] = [];
        let skipped = 0;
        for (const item of items) {
          const key = item.title.toLowerCase();
          if (existing.has(key)) { skipped++; continue; }
          try {
            const projId = resolveProject((item.org_name + " " + item.title + " " + item.statement).toLowerCase()) ?? defaultProj;
            const oId    = resolveOrg(item.org_name) ?? orgId;
            const id     = await writeEvidence(item, dateStr, src.notion_id, oId, projId);
            existing.add(key);
            ids.push(id);
          } catch (e) {
            errors.push(`${src.title} / "${item.title}": ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (ids.length > 0 || items.length === 0) {
          await markSourceExtracted(src.id, src.notion_id);
        }

        totalEvidence += ids.length;
        totalSkipped  += skipped;
        results.push({ title: src.title, evidenceCount: ids.length, skipped, ids });
      } catch (e) {
        errors.push(`${src.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      ok:               true,
      sources:          sources.length,
      evidence_written: totalEvidence,
      skipped:          totalSkipped,
      results,
      errors,
    });
  } catch (e) {
    console.error("extract-conversation-evidence error:", e);
    return NextResponse.json({ error: "Internal error", detail: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }

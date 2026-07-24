/**
 * POST /api/extract-email-evidence
 *
 * Mines evidence from Gmail email threads — the analog of extract-meeting-evidence
 * for the 700+ `sources` rows (source_platform=Gmail, source_type=Email) that were
 * ingested as subject-only stubs by /api/ingest-gmail and never produced evidence.
 *
 * For each un-processed Email source that still has a thread_id, this fetches the
 * FULL thread body via Gmail OAuth, extracts atomic evidence with Haiku, resolves
 * org/project from the thread participants (the SAME resolver ingest uses, so the
 * result matches a fresh ingest), writes evidence linked to the source, and marks
 * the source Processed. Calendar-invite noise ("Accepted:"/"Declined:"…) is skipped.
 *
 * Non-destructive: only inserts evidence + flips the source's processing_status.
 * Batched (default 6/call) so no request exceeds Cloudflare's ~100s edge timeout.
 *
 * Params (JSON body): { batch?, dryRun?, order?: "newest"|"oldest", maxThreads? }
 * Auth: CRON_SECRET via x-agent-key / Authorization: Bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { computeAnthropicCost, makeUsageAccumulator, addUsage, type AnthropicUsage } from "@/lib/anthropic-cost";
import { loadEntityIndex, resolveOrgId, resolveProjectId, type EntityIndex } from "@/lib/resolve-meeting-entities";
import { loadActiveProjects, inferProjectFromText, type MatchableProject } from "@/lib/project-context";
import { getSelfEmails } from "@/lib/hall-self";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Evidence vocabulary (mirrors extract-meeting-evidence) ────────────────────
const VALID_TYPES      = new Set(["Approval","Blocker","Process Step","Stakeholder","Risk","Objection","Decision","Requirement","Dependency","Outcome","Assumption","Contradiction","Insight Candidate"]);
const VALID_THEMES     = new Set(["Approvals","Stakeholders","Operations","Training","Tech","Legal","Procurement","Communications","Rollout","Metrics","Budget","Commercial","Governance"]);
const VALID_GEO        = new Set(["UK","EU","LATAM","North America","Africa / MENA","Asia","Global"]);
const VALID_TOPICS     = new Set(["Refill","Reuse","Zero Waste","Policy","Retail","Organics","Packaging","Cities","Behaviour Change"]);
const VALID_CONFIDENCE = new Set(["High","Medium","Low"]);
const THEME_ALIAS: Record<string, string> = {
  "Tech": "Tech", "Technology": "Tech", "Operations": "Operations", "Commercial": "Commercial",
  "Legal": "Legal", "Procurement": "Procurement", "Communications": "Communications", "Budget": "Budget",
  "Rollout": "Rollout", "Metrics": "Metrics", "Stakeholders": "Stakeholders", "Governance": "Governance",
  "Training": "Training", "Approvals": "Approvals",
};

interface EvidenceItem {
  title: string; type: string; statement: string; excerpt: string; confidence: string;
  affected_theme: string; geography: string; topics: string[]; org_name: string;
}
type EmailSource = { id: string; title: string; thread_id: string; source_date: string | null; org_notion_id: string | null; project_notion_id: string | null };

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (req.headers.get("x-agent-key") === expected) return true;
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  return false;
}

// Calendar / automated noise — skip before spending a Gmail fetch or an LLM call.
const NOISE_PREFIXES = ["accepted:", "declined:", "tentative:", "invitation:", "canceled:", "cancelled:", "updated invitation:", "re: invitation:", "automatic reply:", "out of office"];
function isNoise(title: string): boolean {
  const t = title.toLowerCase().trim();
  return NOISE_PREFIXES.some(p => t.startsWith(p));
}

function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET, refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

function extractEmail(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).toLowerCase().trim();
}
function splitAddressList(header: string): string[] {
  return header.split(",").map(extractEmail).filter(e => /.+@.+\..+/.test(e));
}

// Recursively collect the plain-text body from a Gmail message payload.
type GPart = { mimeType?: string | null; body?: { data?: string | null } | null; parts?: GPart[] | null };
function decodeB64Url(data: string): string {
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}
function collectText(part: GPart | undefined | null, depth = 0): string {
  if (!part || depth > 8) return "";
  let out = "";
  if (part.mimeType === "text/plain" && part.body?.data) out += decodeB64Url(part.body.data) + "\n";
  else if (part.mimeType === "text/html" && part.body?.data && !out) {
    out += decodeB64Url(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ") + "\n";
  }
  for (const p of part.parts ?? []) out += collectText(p, depth + 1);
  return out;
}
// Strip quoted reply chains / signatures to keep the prompt lean and on-topic.
function trimBody(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter(l => !l.trim().startsWith(">"))
    .join("\n")
    .replace(/^On .+wrote:$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 7000);
}

async function extractEmailEvidence(subject: string, participants: string[], body: string, dateStr: string, usageAcc?: AnthropicUsage): Promise<EvidenceItem[]> {
  const prompt = `Extract 0-6 atomic evidence records from this EMAIL THREAD for a portfolio management OS.

Subject: ${subject}
Date: ${dateStr}
Participants: ${participants.join(", ") || "unknown"}
Body:
${body}

Language rule (IMPORTANT):
- Write "title", "statement", "excerpt" in the SAME language as the email. Do not translate. Preserve phrasing.
- "type","affected_theme","geography","topics","confidence" stay in English (controlled vocabularies).

Rules:
- Each item is ONE atomic fact: a decision, commitment, blocker, outcome, requirement, risk, dependency, or a concrete offer/ask.
- Skip pure scheduling, pleasantries, newsletters/marketing, automated notifications, and threads with no substantive project content — return an EMPTY array [] for those.
- Be specific and factual — cite what was actually stated/agreed/requested.

Return ONLY a JSON array (possibly empty):
[
  {
    "title": "Short factual title max 80 chars, in the email language",
    "type": "Decision|Blocker|Outcome|Requirement|Dependency|Risk|Process Step",
    "statement": "1-2 sentence factual description with specifics, in the email language",
    "excerpt": "Most relevant verbatim quote, max 100 chars",
    "confidence": "High|Medium|Low",
    "affected_theme": "Operations|Tech|Commercial|Legal|Procurement|Communications|Budget|Rollout|Metrics|Stakeholders|Governance",
    "geography": "UK|EU|LATAM|North America|Africa / MENA|Asia|Global",
    "topics": ["Refill","Retail","Packaging","Reuse","Zero Waste","Policy"],
    "org_name": "Name of the startup/company/org this is primarily about"
  }
]`;

  const msg = await anthropic.messages.create({ model: HAIKU_MODEL, max_tokens: 1800, messages: [{ role: "user", content: prompt }] });
  if (usageAcc) addUsage(usageAcc, msg.usage);
  const rawText = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]) as EvidenceItem[]; } catch { return []; }
}

async function writeEvidence(item: EvidenceItem, dateStr: string, orgId: string | null, projectId: string | null, sourceId: string): Promise<string> {
  const evidenceType = VALID_TYPES.has(item.type) ? item.type : "Outcome";
  const confidence   = VALID_CONFIDENCE.has(item.confidence) ? item.confidence : "Medium";
  const geo          = VALID_GEO.has(item.geography) ? item.geography : null;
  const theme        = THEME_ALIAS[item.affected_theme];
  const validTopics  = (item.topics ?? []).filter(t => VALID_TOPICS.has(t));
  const sb = getSupabaseServerClient();
  const { data, error } = await sb.from("evidence").insert({
    title:              (item.title ?? "").slice(0, 100),
    evidence_type:      evidenceType,
    evidence_statement: (item.statement ?? "").slice(0, 2000),
    source_excerpt:     (item.excerpt ?? "").slice(0, 500),
    validation_status:  "New",
    confidence_level:   confidence,
    sensitivity_level:  "Internal",
    legacy_source_db:   "Gmail",
    date_captured:      dateStr,
    affected_theme:     (theme && VALID_THEMES.has(theme)) ? theme : null,
    geography:          geo,
    topics:             validTopics.length ? validTopics.join(", ") : null,
    org_notion_id:      orgId,
    project_notion_id:  projectId,
    source_id:          sourceId,
  }).select("id").single();
  if (error) throw new Error(`evidence insert failed: ${error.message}`);
  return (data?.id as string) ?? "";
}

async function _POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const gmail = getGmailClient();
  if (!gmail) return NextResponse.json({ ok: false, error: "Gmail OAuth not configured" }, { status: 500 });

  const body    = await req.text();
  const params  = body ? JSON.parse(body) : {};
  const batch   = typeof params.batch === "number" ? Math.max(1, Math.min(params.batch, 20)) : 6;
  const dryRun  = params.dryRun === true;
  const oldest  = params.order === "oldest";

  const sb = getSupabaseServerClient();

  // Un-processed Email sources that still have a fetchable thread_id.
  const { data: rows, error } = await sb
    .from("sources")
    .select("id, title, thread_id, source_date, org_notion_id, project_notion_id")
    .eq("source_platform", "Gmail").eq("source_type", "Email")
    .not("thread_id", "is", null)
    .neq("processing_status", "Processed")
    .order("source_date", { ascending: oldest, nullsFirst: false })
    .limit(batch * 4); // over-fetch: many will be noise/skipped
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const candidates = (rows ?? []) as EmailSource[];

  const [idx, selfEmails, activeProjects]: [EntityIndex, Set<string>, MatchableProject[]] =
    await Promise.all([loadEntityIndex(sb), getSelfEmails(), loadActiveProjects()]);

  const usageAcc = makeUsageAccumulator();
  const results: { subject: string; evidence: number; org: string; proj: string }[] = [];
  const errors: string[] = [];
  let processed = 0, noiseSkipped = 0, evidenceWritten = 0;

  for (const src of candidates) {
    if (processed >= batch) break;
    // Calendar / automated noise: mark Processed (so it drops out of the
    // unprocessed set and the cursor advances) without a fetch or LLM call.
    // Does NOT count toward the per-call `batch` of real extractions.
    if (isNoise(src.title)) {
      if (!dryRun) await sb.from("sources").update({ processing_status: "Processed" }).eq("id", src.id);
      noiseSkipped++;
      continue;
    }
    try {
      const thread = await gmail.users.threads.get({ userId: "me", id: src.thread_id, format: "full" });
      const messages = thread.data.messages ?? [];
      if (!messages.length) { // thread gone — mark processed so it isn't retried forever
        if (!dryRun) await sb.from("sources").update({ processing_status: "Processed" }).eq("id", src.id);
        processed++; continue;
      }
      // Participants across the whole thread (exclude self).
      const emails = new Set<string>();
      let subject = src.title;
      for (const m of messages) {
        const h = m.payload?.headers ?? [];
        const from = h.find(x => x.name === "From")?.value ?? "";
        if (from) { const e = extractEmail(from); if (e) emails.add(e); }
        for (const f of ["To", "Cc"] as const) {
          const v = h.find(x => x.name === f)?.value ?? "";
          if (v) for (const e of splitAddressList(v)) emails.add(e);
        }
        const subj = h.find(x => x.name === "Subject")?.value;
        if (subj && m === messages[0]) subject = subj;
      }
      for (const s of selfEmails) emails.delete(s.toLowerCase());
      const participantEmails = [...emails];

      const rawBody = messages.map(m => collectText(m.payload as GPart)).join("\n");
      const text = trimBody(rawBody);
      const dateStr = src.source_date ?? new Date().toISOString().slice(0, 10);

      if (text.length < 40) { // nothing to mine
        if (!dryRun) await sb.from("sources").update({ processing_status: "Processed" }).eq("id", src.id);
        processed++; noiseSkipped++; continue;
      }

      const items = await extractEmailEvidence(subject, participantEmails, text, dateStr, usageAcc);

      // Thread-level org from participants (fallback for each item).
      const threadOrg = resolveOrgId(idx, { title: subject, participantEmails, selfEmails });
      let wrote = 0;
      for (const item of items) {
        const itemOrg = resolveOrgId(idx, { title: subject, participantEmails, orgNameHint: item.org_name, selfEmails });
        const orgId = itemOrg.orgNotionId ?? threadOrg.orgNotionId;
        const itemProject = inferProjectFromText(activeProjects, `${item.title} ${item.statement}`)?.notion_id
          ?? resolveProjectId(idx, orgId, { title: subject }).projectNotionId;
        if (!dryRun) { await writeEvidence(item, dateStr, orgId, itemProject, src.id); }
        wrote++;
      }
      evidenceWritten += wrote;

      if (!dryRun) {
        await sb.from("sources").update({
          processing_status: "Processed",
          org_notion_id:     src.org_notion_id ?? threadOrg.orgNotionId,
          project_notion_id: src.project_notion_id ?? resolveProjectId(idx, threadOrg.orgNotionId, { title: subject }).projectNotionId,
        }).eq("id", src.id);
      }
      results.push({ subject: subject.slice(0, 60), evidence: wrote, org: threadOrg.matchPath, proj: items.length ? "see-items" : "-" });
      processed++;
    } catch (e) {
      errors.push(`${src.title.slice(0, 40)}: ${e instanceof Error ? e.message : String(e)}`);
      processed++;
    }
  }

  // How many un-processed candidates remain (for the driver to know when to stop).
  const { count: remaining } = await sb
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("source_platform", "Gmail").eq("source_type", "Email")
    .not("thread_id", "is", null)
    .neq("processing_status", "Processed");

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    processed,
    evidence_written: evidenceWritten,
    noise_or_empty: noiseSkipped,
    remaining_unprocessed: remaining ?? null,
    cost_usd: computeAnthropicCost(usageAcc, HAIKU_MODEL),
    results,
    errors: errors.slice(0, 8),
  });
}

export const POST = _POST;
export const GET = _POST;

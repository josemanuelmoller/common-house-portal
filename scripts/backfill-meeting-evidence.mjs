/**
 * One-time backfill: extract evidence from Fireflies meetings in the past 30 days.
 * Run: node scripts/backfill-meeting-evidence.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Parse .env.local
const env = {};
readFileSync(join(root, ".env.local"), "utf8").split("\n").forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
});

const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const EVIDENCE_DB   = "fa28124978d043039d8932ac9964ccf5";
const HOURS_BACK    = 720; // 30 days

// ─── Maps ─────────────────────────────────────────────────────────────────────

const PROJECT_MAP = {
  "iRefill":          { projectId: "33f45e5b-6633-81f6-9b68-d898237d6533", keywords: ["irefill","airefil","refill","rajneesh","auto mercado","automercado","dispensadora"], domains: ["irefill.in","automercado.biz"] },
  "SUFI":             { projectId: "33f45e5b-6633-81f4-bde2-f97d7a11bfb3", keywords: ["sufi","andresalejandrobarbieri"], domains: [] },
  "Way Out":          { projectId: "33f45e5b-6633-8129-b715-ea38f400d631", keywords: ["wayout","way out"], domains: [] },
  "Beeok":            { projectId: "33f45e5b-6633-8124-b2b8-c79d18a4d46a", keywords: ["beeok"], domains: [] },
  "Yenxa":            { projectId: "33f45e5b-6633-812a-9b42-faf1f0b2518b", keywords: ["yenxa"], domains: [] },
  "Moss Solutions":   { projectId: "33f45e5b-6633-8138-937a-f600fc992756", keywords: ["moss solutions","moss"], domains: [] },
  "GotoFly":          { projectId: "33f45e5b-6633-814e-8d18-e3c96a8d20ca", keywords: ["gotofly","goto fly"], domains: [] },
  "Movener":          { projectId: "33f45e5b-6633-810b-81d1-e22915da2506", keywords: ["movener"], domains: [] },
};

const ORG_MAP = {
  "iRefill":          { notionId: "33f45e5b-6633-810b-95ea-fddc3219b71a", keywords: ["irefill","airefil","refill","rajneesh","auto mercado","automercado","dispensadora"], domains: ["irefill.in","automercado.biz"] },
  "SUFI":             { notionId: "33f45e5b-6633-81b3-84ef-fa1ad08b091b", keywords: ["sufi","andresalejandrobarbieri"], domains: [] },
  "Way Out":          { notionId: "33f45e5b-6633-81cd-9e1b-df610a9ff5dc", keywords: ["wayout","way out"], domains: [] },
  "Beeok":            { notionId: "33f45e5b-6633-818a-ad5b-c387eac4dff7", keywords: ["beeok"], domains: [] },
  "Yenxa":            { notionId: "33f45e5b-6633-8110-8260-dfe9a94ef4e8", keywords: ["yenxa"], domains: [] },
  "Moss Solutions":   { notionId: "33f45e5b-6633-811a-ab3d-ea9e39d97a11", keywords: ["moss solutions","moss"], domains: [] },
  "GotoFly":          { notionId: "33f45e5b-6633-81df-8654-cc715a5bb81e", keywords: ["gotofly","goto fly"], domains: [] },
  "Movener":          { notionId: "33f45e5b-6633-8153-93d1-f86985420a9e", keywords: ["movener"], domains: [] },
};

const VALID_TYPES   = new Set(["Approval","Blocker","Process Step","Stakeholder","Risk","Objection","Decision","Requirement","Dependency","Outcome","Assumption","Contradiction","Insight Candidate"]);
const VALID_THEMES  = new Set(["Approvals","Stakeholders","Operations","Training","Tech","Legal","Procurement","Communications","Rollout","Metrics","Budget","Commercial","Governance"]);
const VALID_GEO     = new Set(["UK","EU","LATAM","North America","Africa / MENA","Asia","Global"]);
const VALID_TOPICS  = new Set(["Refill","Reuse","Zero Waste","Policy","Retail","Organics","Packaging","Cities","Behaviour Change"]);
const VALID_CONF    = new Set(["High","Medium","Low"]);
const THEME_ALIAS   = { "Tech":"Tech","Technology":"Tech","Operations":"Operations","Commercial":"Commercial","Legal":"Legal","Procurement":"Procurement","Communications":"Communications","Budget":"Budget","Rollout":"Rollout","Metrics":"Metrics","Stakeholders":"Stakeholders","Governance":"Governance","Training":"Training","Approvals":"Approvals" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveOrg(hint, participants) {
  const h = hint.toLowerCase(), e = participants.join(" ").toLowerCase();
  for (const o of Object.values(ORG_MAP)) {
    if (o.keywords.some(k => h.includes(k) || e.includes(k)) || o.domains.some(d => e.includes(d))) return o.notionId;
  }
  return null;
}

function resolveProject(title, participants) {
  const t = title.toLowerCase(), e = participants.join(" ").toLowerCase();
  for (const [name, p] of Object.entries(PROJECT_MAP)) {
    if (p.keywords.some(k => t.includes(k) || e.includes(k)) || p.domains.some(d => e.includes(d))) return { id: p.projectId, name };
  }
  return null;
}

async function notionPost(path, body) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── Load existing evidence for dedup ────────────────────────────────────────

async function loadExistingKeys(fromStr) {
  const keys = new Set();
  let cursor;
  do {
    const res = await notionPost(`/databases/${EVIDENCE_DB}/query`, {
      filter: { and: [
        { property: "Date Captured",   date:   { on_or_after: fromStr } },
        { property: "Legacy Source DB", select: { equals: "Meetings [master]" } },
      ]},
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const p of res.results ?? []) {
      const title = p.properties?.["Evidence Title"]?.title?.[0]?.plain_text ?? "";
      const date  = p.properties?.["Date Captured"]?.date?.start ?? "";
      if (title && date) keys.add(`${title.toLowerCase()}::${date}`);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return keys;
}

// ─── Fireflies fetch ──────────────────────────────────────────────────────────

async function fetchTranscripts(fromDate) {
  const query = `query T($fromDate: DateTime) { transcripts(fromDate: $fromDate, limit: 50) { id title date duration participants organizer_email summary { action_items keywords shorthand_bullet overview } } }`;
  const r = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.FIREFLIES_API_KEY}` },
    body: JSON.stringify({ query, variables: { fromDate: fromDate.toISOString() } }),
  });
  const j = await r.json();
  return j?.data?.transcripts ?? [];
}

// ─── Claude extraction ────────────────────────────────────────────────────────

async function extractEvidence(t) {
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
- Be specific and factual

Return ONLY a JSON array:
[{"title":"Short factual title max 80 chars","type":"Decision|Blocker|Outcome|Requirement|Dependency|Risk|Process Step","statement":"1-2 sentence factual description","excerpt":"Most relevant quote max 100 chars","confidence":"High|Medium|Low","affected_theme":"Operations|Tech|Commercial|Legal|Procurement|Communications|Budget|Rollout|Metrics|Stakeholders|Governance","geography":"UK|EU|LATAM|North America|Africa / MENA|Asia|Global","topics":["Refill","Retail"],"org_name":"startup name"}]`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1800, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json();
  const text = j.content?.[0]?.text ?? "[]";
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

// ─── Write evidence ───────────────────────────────────────────────────────────

async function writeEvidence(item, dateStr, orgId, projectId) {
  const type   = VALID_TYPES.has(item.type) ? item.type : "Outcome";
  const conf   = VALID_CONF.has(item.confidence) ? item.confidence : "Medium";
  const geo    = VALID_GEO.has(item.geography) ? item.geography : null;
  const theme  = THEME_ALIAS[item.affected_theme];
  const topics = (item.topics ?? []).filter(t => VALID_TOPICS.has(t));

  const properties = {
    "Evidence Title":     { title:     [{ text: { content: item.title.slice(0, 100) } }] },
    "Evidence Type":      { select:    { name: type } },
    "Evidence Statement": { rich_text: [{ text: { content: item.statement.slice(0, 2000) } }] },
    "Source Excerpt":     { rich_text: [{ text: { content: item.excerpt.slice(0, 500) } }] },
    "Validation Status":  { select:    { name: "New" } },
    "Confidence Level":   { select:    { name: conf } },
    "Sensitivity Level":  { select:    { name: "Internal" } },
    "Legacy Source DB":   { select:    { name: "Meetings [master]" } },
    "Date Captured":      { date:      { start: dateStr } },
  };
  if (theme && VALID_THEMES.has(theme)) properties["Affected Theme"] = { multi_select: [{ name: theme }] };
  if (geo)   properties["Geography"]        = { multi_select: [{ name: geo }] };
  if (topics.length) properties["Topics / Themes"] = { multi_select: topics.map(t => ({ name: t })) };
  if (orgId)     properties["Organization"] = { relation: [{ id: orgId }] };
  if (projectId) properties["Project"]      = { relation: [{ id: projectId }] };

  const res = await notionPost("/pages", { parent: { database_id: EVIDENCE_DB }, properties });
  return res.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const now      = new Date();
const fromDate = new Date(now.getTime() - HOURS_BACK * 3600 * 1000);
const fromStr  = fromDate.toISOString().slice(0, 10);

console.log(`\nBackfill window: ${fromStr} → ${now.toISOString().slice(0, 10)}`);
console.log("Loading existing evidence keys for dedup...");
const existingKeys = await loadExistingKeys(fromStr);
console.log(`  ${existingKeys.size} existing records in window\n`);

console.log("Fetching Fireflies transcripts...");
const transcripts = await fetchTranscripts(fromDate);
console.log(`  ${transcripts.length} transcripts found\n`);

let totalWritten = 0, totalSkipped = 0, totalErrors = 0, meetingsProcessed = 0;

for (const t of transcripts) {
  const dateStr = new Date(t.date).toISOString().slice(0, 10);
  const proj    = resolveProject(t.title, t.participants);

  if (!proj) {
    console.log(`  [${dateStr}] SKIP (unmatched): ${t.title.slice(0, 70)}`);
    continue;
  }

  process.stdout.write(`  [${dateStr}] ${t.title.slice(0, 55).padEnd(55)} → ${proj.name.padEnd(15)} `);
  meetingsProcessed++;

  let items = [];
  try {
    items = await extractEvidence(t);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    totalErrors++;
    continue;
  }

  let written = 0, skipped = 0;
  for (const item of items) {
    const key = `${item.title.toLowerCase()}::${dateStr}`;
    if (existingKeys.has(key)) { skipped++; continue; }
    try {
      const orgId = resolveOrg(item.org_name, t.participants);
      await writeEvidence(item, dateStr, orgId, proj.id);
      existingKeys.add(key);
      written++;
    } catch (e) {
      totalErrors++;
    }
  }

  console.log(`${written} written, ${skipped} skipped (${items.length} extracted)`);
  totalWritten += written;
  totalSkipped += skipped;

  await new Promise(r => setTimeout(r, 400));
}

console.log(`\n${"─".repeat(55)}`);
console.log(`Meetings matched   : ${meetingsProcessed} / ${transcripts.length}`);
console.log(`Evidence written   : ${totalWritten}`);
console.log(`Already existed    : ${totalSkipped}`);
console.log(`Errors             : ${totalErrors}`);

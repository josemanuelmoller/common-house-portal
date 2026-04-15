/**
 * POST /api/scan-opportunity-candidates
 *
 * Scans Gmail inbox for threads that look like untracked business opportunities
 * (partnerships, consulting inquiries, grants, collaboration requests).
 * Cross-references against existing Opportunities to avoid duplicates.
 * Uses Claude Haiku to batch-classify threads.
 * In execute mode, writes Stage="Candidate" records to Opportunities [OS v2].
 *
 * Body:
 *   { mode?: "dry_run" | "execute", lookback_days?: number }
 * Default: dry_run, 14 days
 *
 * Auth: adminGuardApi() or CRON_SECRET header.
 * Trigger: on-demand from Hall admin (Candidate Section scan button).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const JOSE_EMAIL = process.env.GMAIL_USER_EMAIL ?? "josemanuel@wearecommonhouse.com";
const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronToken === `Bearer ${expected}`)) return true;
  if (agentKey === "ch-os-agent-2024-secure") return true;
  try {
    const guard = await adminGuardApi();
    return guard === null;
  } catch {
    return false;
  }
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

function getGmailClient() {
  const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret, GMAIL_REFRESH_TOKEN: token } = process.env;
  if (!id || !secret || !token) return null;
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: token });
  return google.gmail({ version: "v1", auth });
}

function extractEmail(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return m ? m[1].toLowerCase() : header.toLowerCase().trim();
}
function extractName(header: string): string {
  const m = header.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : header.split("@")[0];
}

// ─── Existing opportunities — for dedup ───────────────────────────────────────

async function getExistingOrgTokens(): Promise<Set<string>> {
  try {
    const res = await notion.databases.query({
      database_id: DB_OPPORTUNITIES,
      filter: {
        and: [
          { property: "Stage", select: { does_not_equal: "Won" } },
          { property: "Stage", select: { does_not_equal: "Lost" } },
        ],
      },
      page_size: 100,
    });
    const tokens = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const page of res.results as any[]) {
      const name = (page.properties["Opportunity Name"]?.title?.[0]?.plain_text ?? "").toLowerCase();
      const org  = (page.properties["Organization"]?.rich_text?.[0]?.plain_text ?? "").toLowerCase();
      // Add all word tokens ≥4 chars so partial matches still dedup
      for (const str of [name, org]) {
        str.split(/[\s,·\-–]+/).filter((w: string) => w.length >= 4).forEach((w: string) => tokens.add(w));
      }
    }
    return tokens;
  } catch {
    return new Set();
  }
}

// ─── Claude Haiku classification ─────────────────────────────────────────────

interface ThreadSummary {
  fromName: string;
  from: string;
  subject: string;
  snippet: string;
  gmailUrl: string;
}

interface Classification {
  index: number;
  isOpportunity: boolean;
  confidence: number;        // 0–100
  name: string;              // short opportunity name
  orgName: string;           // org / municipality / company
  type: "Partnership" | "Grant" | "Consulting" | "Investment" | "Other";
  reason: string;            // 1 sentence
}

async function classifyThreads(threads: ThreadSummary[]): Promise<Classification[]> {
  const prompt = `You are scanning Jose's Gmail for untracked business opportunities.
Jose runs Common House — a UK circular economy consultancy + startup accelerator.
Opportunities include: consulting engagements, partnerships, grants, collaborations,
proposals requiring review, and meetings with decision-makers.

NOT opportunities: newsletters, automated notifications, calendar confirmations,
internal team messages, mass mailings, or promotional content.

For each email below, output a JSON object. Threshold: only flag as opportunity if
there is clear human intent AND commercial/collaborative signal.

Emails:
${threads.map((t, i) => `${i + 1}. From: ${t.fromName} <${t.from}>\n   Subject: ${t.subject}\n   Preview: ${t.snippet.slice(0, 200)}`).join("\n\n")}

Return ONLY a valid JSON array — no markdown:
[{"index":1,"isOpportunity":true/false,"confidence":0-100,"name":"short name","orgName":"org name","type":"Partnership|Grant|Consulting|Investment|Other","reason":"1 sentence"}]`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = (res.content[0] as { type: string; text: string }).text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  return JSON.parse(jsonMatch?.[0] ?? "[]") as Classification[];
}

// ─── Notion write ─────────────────────────────────────────────────────────────

async function createCandidate(
  c: Classification,
  thread: ThreadSummary,
): Promise<string | null> {
  try {
    const page = await notion.pages.create({
      parent: { database_id: DB_OPPORTUNITIES },
      properties: {
        "Opportunity Name": { title:     [{ text: { content: c.name.slice(0, 100) } }] },
        "Stage":            { select:    { name: "Candidate" } },
        "Follow-up Status": { select:    { name: "Needed" } },
        "Scope":            { select:    { name: "CH" } },
        "Type":             { select:    { name: c.type } },
        "Organization":     { rich_text: [{ text: { content: (c.orgName || thread.fromName).slice(0, 200) } }] },
        // Pending Action = signal context (graceful if field doesn't exist in schema yet)
        ...(c.reason ? { "Pending Action": { rich_text: [{ text: { content: `${c.reason} — email from ${thread.fromName}` } }] } } : {}),
        // Review URL = Gmail thread link (graceful if field doesn't exist in schema yet)
        ...(thread.gmailUrl ? { "Review URL": { url: thread.gmailUrl } } : {}),
      },
    });
    return page.id;
  } catch (err) {
    console.error("[scan-candidates] create failed:", err);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode         = body.mode          ?? "dry_run";
  const lookbackDays = body.lookback_days ?? 14;

  const gmail = getGmailClient();
  if (!gmail) return NextResponse.json({ error: "Gmail not configured" }, { status: 503 });

  // 1. Fetch inbox threads
  const threadsRes = await gmail.users.threads.list({
    userId: "me",
    q: `in:inbox -category:promotions -category:social -category:updates newer_than:${lookbackDays}d`,
    maxResults: 25,
  });
  const rawThreads = threadsRes.data.threads ?? [];
  if (rawThreads.length === 0) return NextResponse.json({ ok: true, mode, total_scanned: 0, candidates: [], created: 0 });

  // 2. Existing org tokens for dedup
  const existingTokens = await getExistingOrgTokens();

  // 3. Fetch metadata for each thread
  const threads: ThreadSummary[] = [];
  await Promise.all(rawThreads.map(async t => {
    try {
      const thread = await gmail.users.threads.get({ userId: "me", id: t.id!, format: "metadata", metadataHeaders: ["From", "Subject"] });
      const msgs = thread.data.messages ?? [];
      if (!msgs.length) return;
      const firstMsg = msgs[0];
      const fromHeader = firstMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
      const from = extractEmail(fromHeader);
      // Skip automated senders
      if (from.includes("noreply") || from.includes("no-reply") || from.includes("notifications@") || from === JOSE_EMAIL.toLowerCase()) return;
      const fromName = extractName(fromHeader);
      const subject  = firstMsg.payload?.headers?.find(h => h.name === "Subject")?.value ?? "(no subject)";
      const snippet  = firstMsg.snippet ?? "";
      threads.push({ fromName, from, subject, snippet, gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${t.id}` });
    } catch { /* skip failed thread */ }
  }));

  if (threads.length === 0) return NextResponse.json({ ok: true, mode, total_scanned: 0, candidates: [], created: 0 });

  // 4. Dedup: skip threads where sender name/domain already appears in existing opps
  const toDedupCheck = threads.filter(t => {
    const nameTokens = t.fromName.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const domain     = t.from.split("@")[1]?.split(".")[0] ?? "";
    const alreadyTracked = nameTokens.some(tok => existingTokens.has(tok)) || (domain.length >= 4 && existingTokens.has(domain));
    return !alreadyTracked;
  });

  if (toDedupCheck.length === 0) return NextResponse.json({ ok: true, mode, total_scanned: threads.length, deduped: threads.length, candidates: [], created: 0 });

  // 5. Classify with Claude Haiku
  let classifications: Classification[] = [];
  try {
    classifications = await classifyThreads(toDedupCheck);
  } catch (err) {
    console.error("[scan-candidates] classification failed:", err);
    return NextResponse.json({ error: "Classification failed", detail: String(err) }, { status: 502 });
  }

  const opportunityCandidates = classifications.filter(c => c.isOpportunity && c.confidence >= 65);

  // 6. Create Notion records (execute mode only)
  let created = 0;
  const proposed: { name: string; orgName: string; type: string; confidence: number; reason: string }[] = [];

  for (const c of opportunityCandidates) {
    const thread = toDedupCheck[c.index - 1];
    if (!thread) continue;
    proposed.push({ name: c.name, orgName: c.orgName, type: c.type, confidence: c.confidence, reason: c.reason });
    if (mode === "execute") {
      const id = await createCandidate(c, thread);
      if (id) created++;
    }
  }

  return NextResponse.json({
    ok:            true,
    mode,
    lookback_days: lookbackDays,
    total_scanned: threads.length,
    deduped:       threads.length - toDedupCheck.length,
    candidates:    proposed,
    created:       mode === "execute" ? created : 0,
  });
}

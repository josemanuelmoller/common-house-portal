import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { buildPersonIndex, resolvePerson, type PersonIndex, type ResolutionReason } from "@/lib/person-resolver";

// Clipper API — receives clippings from the Chrome extension.
//
// Two flavours on the same endpoint:
//  1. Web clip    — body: { url, title, selection, notes, projectId? }
//                   Creates a `sources` (Source Type=Clipping, Platform=Web) row.
//  2. WhatsApp    — body: { url, chat_name, messages[], raw_content, notes,
//                           source_type: "whatsapp" }
//                   Creates a `sources` (Source Type=Conversation, Platform=WhatsApp) row,
//                   writes full raw to Supabase, splits messages into the
//                   conversation_messages table, fuzzy-matches senders against
//                   people (name + aliases), auto-links mentioned projects.
//
// notion-cutoff-2026-06-02: replaced by canonical writes to `sources` (Supabase).
// Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.1 sources is already canonical
// in Supabase; the Notion CH Sources [OS v2] DB becomes a read-only archive.
//
// Auth:
//  - Bearer token:   Authorization: Bearer <CLIPPER_TOKEN>  (Chrome extension)
//  - Clerk admin     (fallback if called from portal UI)
//
// CORS: locked to portal origin + the Chrome extension scheme. The audit
// flagged that `*` plus a long-lived shared bearer token let any web page
// attempt to write to /api/clipper from the victim's browser. Per-origin
// allowlist eliminates that surface.
const ALLOWED_ORIGINS = new Set<string>([
  "https://portal.wearecommonhouse.com",
  "https://common-house-portal.vercel.app",
  "http://localhost:3000",
]);
const ALLOW_EXT_PREFIX = "chrome-extension://";

function resolveAllowedOrigin(origin: string | null): string {
  if (!origin) return "";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (origin.startsWith(ALLOW_EXT_PREFIX)) return origin;
  return "";
}

// Wave 5 CR3: previously this module had a `let _currentOrigin = ""` that the
// POST entrypoint set before invoking helpers. That was racy under concurrent
// requests in a warm Vercel lambda (multiple requests share the JS heap), so
// one request could read another's origin into its response header.
//
// Now: build a per-request responder object at the handler entrypoint and pass
// it into every helper that needs to emit CORS-tagged JSON. No module-scope
// mutable state.
function corsHeadersFor(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":      origin,
    "Vary":                             "Origin",
    "Access-Control-Allow-Methods":     "POST, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Max-Age":           "86400",
  };
}

type CorsResponder = {
  origin: string;
  json: (body: unknown, status?: number) => NextResponse;
};

function makeCorsResponder(req: Request): CorsResponder {
  const origin = resolveAllowedOrigin(req.headers.get("origin"));
  return {
    origin,
    json: (body: unknown, status = 200) =>
      NextResponse.json(body, { status, headers: corsHeadersFor(origin) }),
  };
}

export async function OPTIONS(req: NextRequest) {
  const cors = makeCorsResponder(req);
  if (!cors.origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(cors.origin) });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WaMessage = {
  time:       string;
  date:       string;
  sender:     string;
  ts?:        number;     // epoch ms (from the extension)
  text:       string;
  quote?:     string | null;
  reactions?: string[];
  media_type?: string;
};

type ClipBody = {
  url:          string;
  title?:       string;
  selection?:   string;
  notes?:       string;
  projectId?:   string;

  // WhatsApp structured payload
  source_type?: "web" | "whatsapp";
  chat_name?:   string;
  messages?:    WaMessage[];
  raw_content?: string;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authorize(req: NextRequest, cors: CorsResponder): Promise<NextResponse | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const expected = process.env.CLIPPER_TOKEN ?? "";
  if (bearerMatch && expected && bearerMatch[1] === expected) return null;

  const adminResp = await adminGuardApi();
  if (!adminResp) return null;

  return cors.json({ error: "Unauthorized" }, 401);
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

async function fetchProjectIndex(sb: ReturnType<typeof getSupabase>) {
  const { data } = await sb.from("projects").select("notion_id, name, canonical_project_code");
  return (data ?? [])
    .filter((p: { name?: string | null }) => (p.name ?? "").trim().length >= 3)
    .map((p: { notion_id: string; name: string; canonical_project_code: string | null }) => ({
      notion_id:  p.notion_id,
      name:       p.name,
      normalized: p.name.toLowerCase(),
      code:       (p.canonical_project_code ?? "").toLowerCase(),
    }));
}

// ─── Project matcher (person matching moved to src/lib/person-resolver.ts) ─

function detectProjects(
  text: string,
  idx: Array<{ notion_id: string; normalized: string; code: string }>,
): string[] {
  const lower = (text ?? "").toLowerCase();
  const hits = new Set<string>();
  for (const p of idx) {
    // Skip project names that are too generic (< 4 chars) to avoid false positives
    if (p.normalized.length >= 4 && lower.includes(p.normalized)) hits.add(p.notion_id);
    if (p.code && p.code.length >= 3 && lower.includes(p.code))   hits.add(p.notion_id);
  }
  return [...hits];
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

async function findExistingByDedupKey(
  sb: ReturnType<typeof getSupabase>,
  dedupKey: string,
): Promise<{ id: string; notion_id: string | null } | null> {
  // notion-cutoff-2026-06-02: replaced by canonical read from sources (Supabase)
  // const res = await notion.databases.query({ database_id: DB.sources, filter: { property: "Dedup Key", rich_text: { equals: dedupKey } }, page_size: 1 });
  try {
    const { data } = await sb
      .from("sources")
      .select("id, notion_id")
      .eq("dedup_key", dedupKey)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { id: data.id as string, notion_id: (data.notion_id as string | null) ?? null };
  } catch {
    return null;
  }
}

// ─── Web clip handler ────────────────────────────────────────────────────────

async function handleWebClip(cors: CorsResponder, body: ClipBody) {
  const { url, title, selection, notes, projectId } = body;

  const pageTitle = (title || url).slice(0, 180);
  const selectionText = (selection ?? "").trim();
  const notesText     = (notes ?? "").trim();
  const today         = new Date().toISOString().slice(0, 10);

  const dedupSeed = `${url}::${selectionText.slice(0, 500)}`;
  const dedupKey  = `clipping:${crypto.createHash("sha256").update(dedupSeed).digest("hex").slice(0, 32)}`;

  const sb = getSupabase();
  const existing = await findExistingByDedupKey(sb, dedupKey);
  if (existing) return cors.json({ ok: true, id: existing.notion_id ?? existing.id, deduped: true });

  const summaryParts: string[] = [];
  if (selectionText) summaryParts.push(selectionText);
  if (notesText)     summaryParts.push(`\n— Notes —\n${notesText}`);
  const processedSummary = summaryParts.join("\n").slice(0, 1900);

  // notion-cutoff-2026-06-02: replaced by canonical write to sources (Supabase)
  // const properties: Record<string, unknown> = {
  //   "Source Title":      { title: [{ text: { content: pageTitle } }] },
  //   "Source Type":       { select: { name: "Clipping" } },
  //   "Source Platform":   { select: { name: "Web" } },
  //   "Source URL":        { url },
  //   "Processing Status": { select: { name: "Ingested" } },
  //   "Source Date":       { date: { start: today } },
  //   "Dedup Key":         { rich_text: [{ text: { content: dedupKey } }] },
  //   "Processed Summary": { rich_text: [{ text: { content: processedSummary } }] },
  //   "Linked Projects":   { relation: [{ id: projectId }] },
  // };
  // const page = await notion.pages.create({ parent: { database_id: DB.sources }, properties });
  const nowIso = new Date().toISOString();
  try {
    const insertRow: Record<string, unknown> = {
      title:              pageTitle,
      source_type:        "Clipping",
      source_platform:    "Web",
      processing_status:  "Ingested",
      processed_summary:  processedSummary,
      dedup_key:          dedupKey,
      source_url:         url,
      source_date:        today,
      notion_created_at:  nowIso,
      created_at:         nowIso,
      updated_at:         nowIso,
      raw_content:        selectionText.length > 1500 ? selectionText : null,
      raw_content_size:   selectionText.length,
      project_notion_id:  projectId ?? null,
    };

    const { data, error } = await sb
      .from("sources")
      .insert(insertRow)
      .select("id, notion_id")
      .single();

    if (error || !data) {
      console.error("[clipper handleWebClip] sources insert failed:", error?.message);
      return cors.json({ error: "Internal error" }, 500);
    }

    return cors.json({ ok: true, id: data.notion_id ?? data.id, deduped: false });
  } catch (err) {
    console.error("[clipper handleWebClip] threw:", err);
    return cors.json({ error: "Internal error" }, 500);
  }
}

// ─── WhatsApp clip handler ───────────────────────────────────────────────────

async function handleWhatsappClip(cors: CorsResponder, body: ClipBody, req: NextRequest) {
  const { url, chat_name, messages, raw_content, notes } = body;
  if (!messages?.length) return cors.json({ error: "messages array required" }, 400);

  const chatTitle = (chat_name || "WhatsApp conversation").slice(0, 180);
  const notesText = (notes ?? "").trim();
  const first     = messages[0];
  const last      = messages[messages.length - 1];

  // Dedup key: url + chat_name + first+last ts + message count (re-clipping the
  // same window returns the same id; clipping a newer delta gets a new one)
  const dedupSeed = `${url}::${chatTitle}::${first.ts ?? ""}::${last.ts ?? ""}::${messages.length}`;
  const dedupKey  = `whatsapp:${crypto.createHash("sha256").update(dedupSeed).digest("hex").slice(0, 32)}`;

  const sb = getSupabase();
  const existing = await findExistingByDedupKey(sb, dedupKey);
  if (existing) return cors.json({ ok: true, id: existing.notion_id ?? existing.id, deduped: true });

  // Build the compact summary (fits in 1900 chars)
  const rangeStr = `${first.date} ${first.time} — ${last.date} ${last.time}`;
  const summaryLines: string[] = [
    `Chat: ${chatTitle} (WhatsApp)`,
    `Messages: ${messages.length}`,
    `Range: ${rangeStr}`,
  ];
  if (notesText) summaryLines.push(`Notes: ${notesText}`);
  summaryLines.push("", "— Last 15 messages —");
  for (const m of messages.slice(-15)) {
    summaryLines.push(`[${m.time}, ${m.date}] ${m.sender}: ${(m.text || "").slice(0, 120)}`);
  }
  const processedSummary = summaryLines.join("\n").slice(0, 1900);

  // source_date = last message timestamp.
  const today      = new Date().toISOString().slice(0, 10);
  const sourceDate = last.ts ? new Date(last.ts).toISOString().slice(0, 10)
                    : first.ts ? new Date(first.ts).toISOString().slice(0, 10)
                    : today;

  // notion-cutoff-2026-06-02: replaced by canonical write to sources (Supabase)
  // const notionProps: Record<string, unknown> = {
  //   "Source Title":      { title: [{ text: { content: chatTitle } }] },
  //   "Source Type":       { select: { name: "Conversation" } },
  //   "Source Platform":   { select: { name: "WhatsApp" } },
  //   "Source URL":        { url },
  //   "Processing Status": { select: { name: "Ingested" } },
  //   "Source Date":       { date: { start: sourceDate } },
  //   "Dedup Key":         { rich_text: [{ text: { content: dedupKey } }] },
  //   "Processed Summary": { rich_text: [{ text: { content: processedSummary } }] },
  // };
  // const page = await notion.pages.create({ parent: { database_id: DB.sources }, properties: notionProps });
  const rawText  = raw_content ?? "";
  const nowIso   = new Date().toISOString();

  const { data: srcRow, error: srcErr } = await sb
    .from("sources")
    .insert({
      title:             chatTitle,
      source_type:       "Conversation",
      source_platform:   "WhatsApp",
      processing_status: "Ingested",
      processed_summary: processedSummary,
      dedup_key:         dedupKey,
      source_url:        url,
      source_date:       sourceDate,
      notion_created_at: nowIso,
      created_at:        nowIso,
      updated_at:        nowIso,
      raw_content:       rawText,
      raw_content_size:  rawText.length,
    })
    .select("id, notion_id")
    .single();

  if (srcErr || !srcRow) {
    console.error("[clipper] WA sources insert failed:", srcErr);
    return cors.json({ error: "Failed to create source" }, 500);
  }

  const sourceId = srcRow.id as string;
  const sourceExternalId = (srcRow.notion_id as string | null) ?? sourceId;

  // 3. Build matcher indexes
  const [peopleIdx, projectIdx] = await Promise.all([
    buildPersonIndex(sb),
    fetchProjectIndex(sb),
  ]);
  void (peopleIdx as PersonIndex);

  // 4. Transform + match.
  const matchedProjects = new Set<string>();
  let matchedPeopleCount = 0;
  const bySender: Map<string, {
    count: number;
    match: ReturnType<typeof resolvePerson>;
    displayName: string;
    first_ts: string | null;
    last_ts:  string | null;
  }> = new Map();
  const messageRows = messages.map((m, i) => {
    const match = resolvePerson({ name: m.sender }, peopleIdx);
    if (match.person_id) matchedPeopleCount++;

    const senderKey = (m.sender || "").toLowerCase().trim();
    const ts = m.ts ? new Date(m.ts).toISOString() : null;
    const prev = bySender.get(senderKey);
    if (!prev) {
      bySender.set(senderKey, {
        count: 1, match,
        displayName: m.sender || "(unknown)",
        first_ts: ts, last_ts: ts,
      });
    } else {
      prev.count += 1;
      if (ts && (!prev.first_ts || ts < prev.first_ts)) prev.first_ts = ts;
      if (ts && (!prev.last_ts  || ts > prev.last_ts))  prev.last_ts  = ts;
    }

    for (const pid of detectProjects(m.text, projectIdx)) matchedProjects.add(pid);
    return {
      source_id:        sourceId,
      notion_id:        sourceExternalId,
      ts,
      sender_name:      m.sender || "(unknown)",
      sender_person_id: match.person_id,
      sender_is_self:   match.is_self,
      direction:        match.is_self ? "out" : "in",
      text:             (m.text || "").slice(0, 8000),
      media_type:       m.media_type ?? null,
      quote:            m.quote ?? null,
      reactions:        m.reactions ?? null,
      raw_index:        i,
      platform:         "whatsapp",
    };
  }).filter(r => r.ts); // must have a timestamp to satisfy NOT NULL

  // 5. Bulk insert in chunks
  let messagesStored = 0;
  if (messageRows.length) {
    const CHUNK = 500;
    for (let i = 0; i < messageRows.length; i += CHUNK) {
      const chunk = messageRows.slice(i, i + CHUNK);
      const { error } = await sb.from("conversation_messages").insert(chunk);
      if (error) {
        console.error("[clipper] conversation_messages insert failed:", error);
        break;
      }
      messagesStored += chunk.length;
    }
  }

  // 6a. New senders with NO match — create a "suggested" people row.
  try {
    const newPeopleRows: Array<Record<string, unknown>> = [];
    const suggestedAt = new Date().toISOString();
    for (const [senderKey, info] of bySender) {
      if (!senderKey || info.match.is_self) continue;
      if (info.match.person_id) continue;
      if (senderKey.length < 2) continue;
      newPeopleRows.push({
        email:             null,
        full_name:         info.displayName,
        display_name:      info.displayName,
        aliases:           [senderKey],
        auto_suggested:    "whatsapp_clipper",
        auto_suggested_at: suggestedAt,
        first_seen_at:     info.first_ts ?? suggestedAt,
        last_seen_at:      info.last_ts  ?? suggestedAt,
        created_at:        suggestedAt,
        updated_at:        suggestedAt,
      });
    }
    if (newPeopleRows.length) {
      await sb.from("people").insert(newPeopleRows);
    }
  } catch (e) {
    console.warn("[clipper] people suggest (whatsapp_clipper) failed:", e);
  }

  // 6b. Medium-confidence matches → orphan_match_candidate
  try {
    const rows: Array<Record<string, unknown>> = [];
    for (const [senderKey, info] of bySender) {
      if (!senderKey || info.match.is_self) continue;
      if (info.match.confidence >= 0.8) continue;
      if (!info.match.person_id) continue;
      rows.push({
        source_id:           sourceId,
        sender_name:         senderKey,
        candidate_person_id: info.match.person_id,
        candidate_reason:    info.match.matched_by as ResolutionReason,
        confidence:          info.match.confidence,
        msg_count:           info.count,
        status:              "pending",
      });
    }
    if (rows.length) {
      await sb.from("orphan_match_candidates").upsert(rows, {
        onConflict: "source_id,candidate_person_id,sender_name",
        ignoreDuplicates: true,
      });
    }
  } catch (e) {
    console.warn("[clipper] orphan_match_candidates file failed:", e);
  }

  // 7. Persist matched projects.
  // notion-cutoff-2026-06-02: replaced by canonical write to sources.project_notion_id (Supabase)
  // await notion.pages.update({ page_id: notionId, properties: { "Linked Projects": { relation: [...matchedProjects].map(id => ({ id })) } } });
  // Note: sources currently models Linked Projects as a single FK column
  // (project_notion_id). When multiple projects match, we keep the first match
  // here; full multi-project linking awaits a junction table.
  if (matchedProjects.size) {
    try {
      const projectArr = [...matchedProjects];
      await sb.from("sources").update({
        project_notion_id: projectArr[0],
        updated_at:        new Date().toISOString(),
      }).eq("id", sourceId);
    } catch (e) {
      console.warn("[clipper] sources project link update failed:", e);
    }
  }

  // 8. Fire-and-forget AI distill.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const agentKey = process.env.CRON_SECRET ?? "";
    if (agentKey) {
      fetch(`${appUrl}/api/extract-conversation-evidence`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-agent-key": agentKey },
        body:    JSON.stringify({ source_id: sourceId }),
      }).catch(() => { /* silence */ });
    }
  } catch (e) {
    console.warn("[clipper] AI distill trigger failed:", e);
  }

  return cors.json({
    ok:               true,
    id:               sourceExternalId,
    deduped:          false,
    messages_stored:  messagesStored,
    people_matched:   matchedPeopleCount,
    projects_matched: matchedProjects.size,
    ai_distill:       "queued",
  });
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cors = makeCorsResponder(req);
  const authFail = await authorize(req, cors);
  if (authFail) return authFail;

  let body: ClipBody;
  try {
    body = await req.json();
  } catch {
    return cors.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.url || !/^https?:\/\//i.test(body.url)) {
    return cors.json({ error: "Valid http(s) url required" }, 400);
  }

  if (body.source_type === "whatsapp" && body.messages?.length) {
    return handleWhatsappClip(cors, body, req);
  }

  return handleWebClip(cors, body);
}

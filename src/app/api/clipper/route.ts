import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

// Clipper API — receives clippings from the Chrome extension.
//
// Two flavours on the same endpoint:
//  1. Web clip    — body: { url, title, selection, notes, projectId? }
//                   Creates a CH Sources [OS v2] record with
//                   Source Type=Clipping, Platform=Web.
//  2. WhatsApp    — body: { url, chat_name, messages[], raw_content, notes,
//                           source_type: "whatsapp" }
//                   Creates a Source (Type=Conversation, Platform=WhatsApp),
//                   writes full raw to Supabase, splits messages into the
//                   conversation_messages table, fuzzy-matches senders against
//                   people (name + aliases), auto-links mentioned projects.
//
// Auth:
//  - Bearer token:   Authorization: Bearer <CLIPPER_TOKEN>  (Chrome extension)
//  - Clerk admin     (fallback if called from portal UI)
//
// CORS: open. Bearer/session is the gate.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
};

function corsJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
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

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const expected = process.env.CLIPPER_TOKEN ?? "";
  if (bearerMatch && expected && bearerMatch[1] === expected) return null;

  const adminResp = await adminGuardApi();
  if (!adminResp) return null;

  return corsJson({ error: "Unauthorized" }, 401);
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

type PeopleIdx = {
  all:       Array<{ id: string; name: string; aliases: string[] }>;
  exact:     Map<string, { id: string; name: string }>;
  aliasMap:  Map<string, { id: string; name: string }>;
  firstName: Map<string, Array<{ id: string; name: string }>>;
};

async function fetchPeopleIndex(sb: ReturnType<typeof getSupabase>): Promise<PeopleIdx> {
  const { data } = await sb.from("people").select("id, name, aliases");
  const exact     = new Map<string, { id: string; name: string }>();
  const aliasMap  = new Map<string, { id: string; name: string }>();
  const firstName = new Map<string, Array<{ id: string; name: string }>>();
  const all: PeopleIdx["all"] = [];
  for (const p of (data ?? []) as Array<{ id: string; name: string | null; aliases: string[] | null }>) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    const entry = { id: p.id, name, aliases: p.aliases ?? [] };
    all.push(entry);
    const n = name.toLowerCase();
    exact.set(n, { id: p.id, name });
    const fn = n.split(" ")[0];
    if (!firstName.has(fn)) firstName.set(fn, []);
    firstName.get(fn)!.push({ id: p.id, name });
    for (const a of (p.aliases ?? [])) {
      const al = String(a).toLowerCase().trim();
      if (al) aliasMap.set(al, { id: p.id, name });
    }
  }
  return { all, exact, aliasMap, firstName };
}

async function fetchSelfIdentities(sb: ReturnType<typeof getSupabase>): Promise<Set<string>> {
  try {
    const { data } = await sb.from("hall_self_identities").select("identity");
    return new Set((data ?? []).map((r: { identity?: string }) => String(r.identity ?? "").toLowerCase().trim()));
  } catch {
    return new Set();
  }
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

// ─── Matchers ─────────────────────────────────────────────────────────────────

function matchSender(
  rawName: string,
  idx: PeopleIdx,
  selfSet: Set<string>,
): { person_id: string | null; is_self: boolean } {
  const n = (rawName ?? "").toLowerCase().trim();
  if (!n) return { person_id: null, is_self: false };

  // "Tú" / "You" / "Yo" are WA's self-markers in replies/quotes
  if (/^(tú|tu|you|yo)$/.test(n)) return { person_id: null, is_self: true };
  if (selfSet.has(n)) return { person_id: null, is_self: true };

  if (idx.exact.has(n))    return { person_id: idx.exact.get(n)!.id,    is_self: false };
  if (idx.aliasMap.has(n)) return { person_id: idx.aliasMap.get(n)!.id, is_self: false };

  // Bidirectional substring (handles "Francisco Cerda L" vs "Francisco Cerda")
  for (const p of idx.all) {
    const pn = p.name.toLowerCase();
    if (pn.length >= 3 && (n.includes(pn) || pn.includes(n))) {
      return { person_id: p.id, is_self: false };
    }
  }

  // Fallback: unique first-name match
  const fn = n.split(" ")[0];
  const cands = idx.firstName.get(fn);
  if (cands?.length === 1) return { person_id: cands[0].id, is_self: false };

  return { person_id: null, is_self: false };
}

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

async function findExistingByDedupKey(dedupKey: string): Promise<string | null> {
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: { property: "Dedup Key", rich_text: { equals: dedupKey } },
      page_size: 1,
    });
    return res.results[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Web clip handler (existing behaviour, kept stable) ──────────────────────

async function handleWebClip(body: ClipBody) {
  const { url, title, selection, notes, projectId } = body;

  const pageTitle = (title || url).slice(0, 180);
  const selectionText = (selection ?? "").trim();
  const notesText     = (notes ?? "").trim();
  const today         = new Date().toISOString().slice(0, 10);

  const dedupSeed = `${url}::${selectionText.slice(0, 500)}`;
  const dedupKey  = `clipping:${crypto.createHash("sha256").update(dedupSeed).digest("hex").slice(0, 32)}`;

  const existingId = await findExistingByDedupKey(dedupKey);
  if (existingId) return corsJson({ ok: true, id: existingId, deduped: true });

  const summaryParts: string[] = [];
  if (selectionText) summaryParts.push(selectionText);
  if (notesText)     summaryParts.push(`\n— Notes —\n${notesText}`);
  const processedSummary = summaryParts.join("\n").slice(0, 1900);

  const properties: Record<string, unknown> = {
    "Source Title":      { title: [{ text: { content: pageTitle } }] },
    "Source Type":       { select: { name: "Clipping" } },
    "Source Platform":   { select: { name: "Web" } },
    "Source URL":        { url },
    "Processing Status": { select: { name: "Ingested" } },
    "Source Date":       { date: { start: today } },
    "Dedup Key":         { rich_text: [{ text: { content: dedupKey } }] },
  };
  if (processedSummary) properties["Processed Summary"] = { rich_text: [{ text: { content: processedSummary } }] };
  if (projectId)        properties["Linked Projects"]   = { relation: [{ id: projectId }] };

  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.sources },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
    });

    // Also persist the full selection to Supabase so a long clip isn't lost to
    // Notion's 2000-char rich_text cap. Best-effort — doesn't block the response.
    if (selectionText.length > 1500) {
      try {
        const sb = getSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createdTime = (page as any).created_time as string | undefined;
        await sb.from("sources").upsert({
          notion_id:          page.id,
          title:              pageTitle,
          source_type:        "Clipping",
          source_platform:    "Web",
          processing_status:  "Ingested",
          processed_summary:  processedSummary,
          dedup_key:          dedupKey,
          source_url:         url,
          source_date:        today,
          notion_created_at:  createdTime ?? new Date().toISOString(),
          raw_content:        selectionText,
          raw_content_size:   selectionText.length,
        }, { onConflict: "notion_id" });
      } catch (e) {
        console.warn("[clipper] web clip Supabase persist failed:", e);
      }
    }

    return corsJson({ ok: true, id: page.id, deduped: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Notion error";
    return corsJson({ error: message }, 500);
  }
}

// ─── WhatsApp clip handler ───────────────────────────────────────────────────

async function handleWhatsappClip(body: ClipBody) {
  const { url, chat_name, messages, raw_content, notes } = body;
  if (!messages?.length) return corsJson({ error: "messages array required" }, 400);

  const chatTitle = (chat_name || "WhatsApp conversation").slice(0, 180);
  const notesText = (notes ?? "").trim();
  const first     = messages[0];
  const last      = messages[messages.length - 1];

  // Dedup key: url + chat_name + first+last ts + message count (re-clipping the
  // same window returns the same id; clipping a newer delta gets a new one)
  const dedupSeed = `${url}::${chatTitle}::${first.ts ?? ""}::${last.ts ?? ""}::${messages.length}`;
  const dedupKey  = `whatsapp:${crypto.createHash("sha256").update(dedupSeed).digest("hex").slice(0, 32)}`;

  const existingId = await findExistingByDedupKey(dedupKey);
  if (existingId) return corsJson({ ok: true, id: existingId, deduped: true });

  // Build the compact Notion summary (fits in 1900 chars)
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

  const today      = new Date().toISOString().slice(0, 10);
  const sourceDate = first.ts ? new Date(first.ts).toISOString().slice(0, 10) : today;

  // 1. Notion page
  const notionProps: Record<string, unknown> = {
    "Source Title":      { title: [{ text: { content: chatTitle } }] },
    "Source Type":       { select: { name: "Conversation" } },
    "Source Platform":   { select: { name: "WhatsApp" } },
    "Source URL":        { url },
    "Processing Status": { select: { name: "Ingested" } },
    "Source Date":       { date: { start: sourceDate } },
    "Dedup Key":         { rich_text: [{ text: { content: dedupKey } }] },
    "Processed Summary": { rich_text: [{ text: { content: processedSummary } }] },
  };

  let notionId: string;
  let notionCreatedAt: string | undefined;
  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.sources },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: notionProps as any,
    });
    notionId        = page.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notionCreatedAt = (page as any).created_time as string | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notion error";
    return corsJson({ error: "Failed to create Notion page: " + message }, 500);
  }

  // 2. Supabase: upsert sources row (so we have source_id for FK), then write
  //    raw + normalized messages
  const sb = getSupabase();
  const rawText = raw_content ?? "";

  const { data: srcRow, error: srcErr } = await sb
    .from("sources")
    .upsert({
      notion_id:         notionId,
      title:             chatTitle,
      source_type:       "Conversation",
      source_platform:   "WhatsApp",
      processing_status: "Ingested",
      processed_summary: processedSummary,
      dedup_key:         dedupKey,
      source_url:        url,
      source_date:       sourceDate,
      notion_created_at: notionCreatedAt ?? new Date().toISOString(),
      raw_content:       rawText,
      raw_content_size:  rawText.length,
    }, { onConflict: "notion_id" })
    .select("id")
    .single();

  if (srcErr || !srcRow) {
    console.error("[clipper] WA sources upsert failed:", srcErr);
    return corsJson({
      ok: true,
      id: notionId,
      deduped: false,
      messages_stored: 0,
      warning: "Supabase source upsert failed — messages not persisted",
    });
  }

  const sourceId = srcRow.id as string;

  // 3. Build matcher indexes
  const [peopleIdx, selfSet, projectIdx] = await Promise.all([
    fetchPeopleIndex(sb),
    fetchSelfIdentities(sb),
    fetchProjectIndex(sb),
  ]);

  // 4. Transform + match
  const matchedProjects = new Set<string>();
  let matchedPeopleCount = 0;
  const messageRows = messages.map((m, i) => {
    const match = matchSender(m.sender, peopleIdx, selfSet);
    if (match.person_id) matchedPeopleCount++;
    for (const pid of detectProjects(m.text, projectIdx)) matchedProjects.add(pid);
    const ts = m.ts ? new Date(m.ts).toISOString() : null;
    return {
      source_id:        sourceId,
      notion_id:        notionId,
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

  // 6. Update Linked Projects on the Notion page with everything we matched
  if (matchedProjects.size) {
    try {
      await notion.pages.update({
        page_id: notionId,
        properties: {
          "Linked Projects": {
            relation: [...matchedProjects].map(id => ({ id })),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
    } catch (e) {
      console.warn("[clipper] Linked Projects update failed:", e);
    }
  }

  return corsJson({
    ok:               true,
    id:               notionId,
    deduped:          false,
    messages_stored:  messagesStored,
    people_matched:   matchedPeopleCount,
    projects_matched: matchedProjects.size,
  });
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authFail = await authorize(req);
  if (authFail) return authFail;

  let body: ClipBody;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, 400);
  }

  if (!body.url || !/^https?:\/\//i.test(body.url)) {
    return corsJson({ error: "Valid http(s) url required" }, 400);
  }

  if (body.source_type === "whatsapp" && body.messages?.length) {
    return handleWhatsappClip(body);
  }

  return handleWebClip(body);
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";
import { buildPersonIndex, resolvePerson, type PersonIndex, type ResolutionReason } from "@/lib/person-resolver";

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
  const [peopleIdx, projectIdx] = await Promise.all([
    buildPersonIndex(sb),
    fetchProjectIndex(sb),
  ]);

  // 4. Transform + match. Every message is resolved through the shared
  // person-resolver so strategy + confidence can be surfaced later in
  // orphan_match_candidates when sender_person_id lands null at write time.
  const matchedProjects = new Set<string>();
  let matchedPeopleCount = 0;
  const bySender: Map<string, { count: number; match: ReturnType<typeof resolvePerson> }> = new Map();
  const messageRows = messages.map((m, i) => {
    const match = resolvePerson({ name: m.sender }, peopleIdx);
    if (match.person_id) matchedPeopleCount++;

    const senderKey = (m.sender || "").toLowerCase().trim();
    const prev = bySender.get(senderKey);
    if (!prev) bySender.set(senderKey, { count: 1, match });
    else       prev.count += 1;

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

  // 6. For any sender that resolved with confidence < 1 (or not at all),
  // file an orphan_match_candidate so it can be reviewed and approved later
  // without blocking the clip. Exact-email matches (conf 1) skip this.
  try {
    const rows: Array<Record<string, unknown>> = [];
    for (const [senderKey, info] of bySender) {
      if (!senderKey || info.match.is_self) continue;
      // Only record candidates that have a candidate person OR a failed match
      // we want the admin to know about. Confidence 1 = definitely right,
      // skip. Confidence 0 with no candidate = nothing to suggest yet.
      if (info.match.confidence >= 1) continue;
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

  // 7. Update Linked Projects on the Notion page with everything we matched
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

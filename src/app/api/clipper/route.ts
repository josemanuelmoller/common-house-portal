import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

// Clipper API — receives web clippings from the Chrome extension and creates
// CH Sources [OS v2] records with Source Type = "Clipping", Platform = "Web".
//
// Auth: two accepted patterns.
//   1. Bearer token:   Authorization: Bearer <CLIPPER_TOKEN>
//      — used by the Chrome extension (token stored in chrome.storage.local)
//   2. Clerk admin session (via adminGuardApi)
//      — used if this route is ever called from the portal UI
//
// CORS: open. Auth is the gate; the origin doesn't matter.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type ClipBody = {
  url: string;
  title?: string;
  selection?: string;
  notes?: string;
  projectId?: string;
};

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  // Pattern 1: Bearer token (extension)
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const expected = process.env.CLIPPER_TOKEN ?? "";
  if (bearerMatch && expected && bearerMatch[1] === expected) return null;

  // Pattern 2: Clerk admin session (fallback)
  const adminResp = await adminGuardApi();
  if (!adminResp) return null;

  // Neither matched
  return corsJson({ error: "Unauthorized" }, 401);
}

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

export async function POST(req: NextRequest) {
  const authFail = await authorize(req);
  if (authFail) return authFail;

  let body: ClipBody;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, 400);
  }

  const { url, title, selection, notes, projectId } = body;
  if (!url || !/^https?:\/\//i.test(url)) {
    return corsJson({ error: "Valid http(s) url required" }, 400);
  }

  const pageTitle = (title || url).slice(0, 180);
  const selectionText = (selection ?? "").trim();
  const notesText = (notes ?? "").trim();
  const today = new Date().toISOString().slice(0, 10);

  const dedupSeed = `${url}::${selectionText.slice(0, 500)}`;
  const dedupKey = `clipping:${crypto.createHash("sha256").update(dedupSeed).digest("hex").slice(0, 32)}`;

  const existingId = await findExistingByDedupKey(dedupKey);
  if (existingId) {
    return corsJson({ ok: true, id: existingId, deduped: true });
  }

  const summaryParts: string[] = [];
  if (selectionText) summaryParts.push(selectionText);
  if (notesText) summaryParts.push(`\n— Notes —\n${notesText}`);
  // Notion rich_text has a 2000-char limit per text object
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
  if (processedSummary) {
    properties["Processed Summary"] = { rich_text: [{ text: { content: processedSummary } }] };
  }
  if (projectId) {
    properties["Linked Projects"] = { relation: [{ id: projectId }] };
  }

  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.sources },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
    });
    return corsJson({ ok: true, id: page.id, deduped: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Notion error";
    return corsJson({ error: message }, 500);
  }
}

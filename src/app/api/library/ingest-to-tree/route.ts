/**
 * POST /api/library/ingest-to-tree
 *
 * Third ingest rail — external docs (PDF, DOCX, URL, pasted text) become
 * evidence in the knowledge tree. Parallel to meetings/emails/whatsapp.
 *
 * Flow:
 *   1. Accept multipart (file) or JSON (text, url).
 *   2. Extract text content:
 *      - PDF → passed natively to Claude (document content block)
 *      - DOCX → mammoth → plain text
 *      - URL → fetch + strip-to-text
 *      - Paste → use as-is
 *   3. Upload the binary to Supabase Storage (`library-docs` bucket) for
 *      traceability, same convention as /api/ingest-library.
 *   4. Call Claude Sonnet 4.6 with an extraction prompt specifically for
 *      static docs — produces N atomic insights (1-2 sentences each) with a
 *      short excerpt anchor.
 *   5. For each insight, insert an Evidence row in Supabase with:
 *      - case_code = user-provided or generated from metadata
 *      - validation_status = "Validated" (human-initiated, skip queue)
 *      - source_excerpt = the anchor snippet
 *      - workstream / project_notion_id = optional passthrough
 *   6. Upsert knowledge_cases row for the code.
 *   7. Invoke /api/knowledge-curator with the new evidence IDs so the tree
 *      picks them up within the same request.
 *   8. Return { source_file_url, case_code, evidence_ids, curator_summary }.
 *
 * Auth: admin session (same-origin from the UI) OR CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  canonicaliseCaseCode,
  generateTypedCaseCode,
  parseCaseCode,
  sanitiseIdentifier,
  type CaseType,
} from "@/lib/case-codes";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
const BUCKET = "library-docs";
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 365 * 10;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronKey === `Bearer ${expected}`)) return true;
  const denied = await adminGuardApi();
  return denied === null;
}

type Insight = {
  title: string;
  statement: string;
  source_excerpt: string;
  evidence_type: string;
  confidence_level: "High" | "Medium" | "Low";
  affected_theme: string | null;
  stakeholder_function: string | null;
  target_leaf_hint: string | null;
};

const EXTRACT_PROMPT = `You are a knowledge extractor for Common House. You receive a static document (report, case study, operational guide, regulation, academic paper) and must extract multiple ATOMIC domain insights.

Rules:

1. Produce 3-15 insights depending on doc length. Each insight is ONE atomic domain fact — not a summary of multiple facts.

2. Each insight must be RE-USABLE — it tells the reader something about how the domain works, not a chronological narrative. Examples:
   - Good: "Cardboard tube format offers the lowest tooling cost at USD 5,000 compared to flow pack (USD 28,500) — most capital-efficient for solid refill launch."
   - Bad: "The team met on Tuesday and decided to go with cardboard tube."

3. Distinguish PROJECT FACTS (ignore unless they illustrate a pattern) from DOMAIN INSIGHTS (keep).

4. Each insight carries a short verbatim excerpt anchor from the source (5-120 chars, straight quote if possible) so the reader can trace it back.

5. evidence_type: pick the best fit from: "Outcome", "Decision", "Process Step", "Requirement", "Dependency", "Blocker", "Concern", "Objection", "Risk", "Stakeholder", "Insight Candidate", "Assumption", "Contradiction".

6. confidence_level: "High" when directly asserted in the doc; "Medium" when inferred by you; "Low" when ambiguous.

7. affected_theme + stakeholder_function are optional — populate ONLY if clear from the doc (e.g. "Operations", "Quality", "Legal").

8. target_leaf_hint: suggest which leaf of the Common House knowledge tree this insight belongs to, from these leaves:
   - reuse/packaging/refill/on-the-go
   - reuse/packaging/refill/at-home
   - reuse/packaging/return/on-the-go
   - reuse/packaging/return/from-home
   - reuse/packaging/transit
   - organics/compost/bsf
   - new-materials/biomaterials
   Only populate when you are confident. Otherwise leave null.

Output strict JSON only:
{
  "insights": [
    {
      "title": "short factual title (≤80 chars)",
      "statement": "1-2 sentence synthesis",
      "source_excerpt": "verbatim quote from source",
      "evidence_type": "Outcome",
      "confidence_level": "High",
      "affected_theme": "Operations" | null,
      "stakeholder_function": "Quality" | null,
      "target_leaf_hint": "reuse/packaging/refill/on-the-go" | null
    }
  ]
}`;

async function extractText(file: File): Promise<{ text: string; pdfBase64?: string; buffer: Buffer }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return { text: "", pdfBase64: buf.toString("base64"), buffer: buf };
  }
  if (mime.includes("word") || name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value, buffer: buf };
  }
  if (name.endsWith(".doc")) {
    // Legacy .doc not supported by mammoth — return plain text fallback
    return { text: buf.toString("utf-8"), buffer: buf };
  }
  return { text: buf.toString("utf-8"), buffer: buf };
}

async function fetchUrlAsText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 CommonHouse-Ingest" } });
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`);
  const html = await res.text();
  // Minimal strip-to-text — remove scripts/styles, collapse whitespace
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 60000);
}

async function _POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputText = "";
  let pdfBase64: string | undefined;
  let buffer: Buffer | null = null;
  let originalFileName = "";
  let fileMimeType = "application/octet-stream";

  // Metadata fields (optional — control case_code generation)
  let userCaseCode:   string | null = null;    // full code e.g. "DOC:EMF-UK-2023"
  let caseType:       CaseType = "DOC";
  let caseIdentifier: string | null = null;   // e.g. "EMF"
  let caseScope:      string | null = null;   // e.g. "UK"
  let caseYear:       number | null = null;
  let caseTitle:      string | null = null;
  let projectNotionId: string | null = null;
  let sourceNote:     string = "";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file      = form.get("file") as File | null;
    const pastedText = form.get("text") as string | null;
    const urlInput   = form.get("url") as string | null;
    userCaseCode   = (form.get("case_code") as string | null)   || null;
    caseType       = ((form.get("case_type") as string | null)  || "DOC") as CaseType;
    caseIdentifier = (form.get("case_identifier") as string | null) || null;
    caseScope      = (form.get("case_scope") as string | null) || null;
    const y        = form.get("case_year") as string | null;
    caseYear       = y ? parseInt(y, 10) : null;
    caseTitle      = (form.get("case_title") as string | null) || null;
    projectNotionId = (form.get("project_notion_id") as string | null) || null;
    sourceNote     = (form.get("source") as string | null) || "";

    if (file) {
      originalFileName = file.name;
      fileMimeType = file.type || "application/octet-stream";
      const extracted = await extractText(file);
      inputText = extracted.text;
      pdfBase64 = extracted.pdfBase64;
      buffer = extracted.buffer;
    } else if (urlInput) {
      inputText = await fetchUrlAsText(urlInput);
      sourceNote = sourceNote || urlInput;
    } else if (pastedText) {
      inputText = pastedText;
    } else {
      return NextResponse.json({ error: "No file, url, or text provided" }, { status: 400 });
    }
  } else {
    const body = await req.json();
    inputText = body.text ?? "";
    userCaseCode    = body.case_code ?? null;
    caseType        = (body.case_type ?? "DOC") as CaseType;
    caseIdentifier  = body.case_identifier ?? null;
    caseScope       = body.case_scope ?? null;
    caseYear        = body.case_year ?? null;
    caseTitle       = body.case_title ?? null;
    projectNotionId = body.project_notion_id ?? null;
    sourceNote      = body.source ?? "";
    if (!inputText.trim()) {
      return NextResponse.json({ error: "text is required in JSON body" }, { status: 400 });
    }
  }

  // Resolve final case_code
  let finalCaseCode: string;
  if (userCaseCode) {
    const canonical = canonicaliseCaseCode(userCaseCode);
    if (!canonical) {
      return NextResponse.json({ error: `Malformed case_code: ${userCaseCode}` }, { status: 400 });
    }
    finalCaseCode = canonical;
  } else {
    if (!caseIdentifier) {
      return NextResponse.json({ error: "case_code OR (case_identifier + case_year) required" }, { status: 400 });
    }
    const year = caseYear ?? new Date().getFullYear();
    finalCaseCode = generateTypedCaseCode({
      type: caseType,
      identifier: sanitiseIdentifier(caseIdentifier),
      scope: caseScope,
      year,
    });
  }
  const parsedCase = parseCaseCode(finalCaseCode)!;

  // Upload file to Supabase Storage if we have binary content
  const sb = getSupabaseServerClient();
  let storagePath: string | undefined;
  let sourceFileUrl: string | undefined;
  if (buffer && originalFileName) {
    const slug = randomUUID().slice(0, 8);
    storagePath = `library/${slug}-${originalFileName}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: fileMimeType,
      upsert: false,
    });
    if (!upErr) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
      sourceFileUrl = data?.signedUrl ?? undefined;
    }
  }

  // Call Claude to extract atomic insights
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = pdfBase64
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "Extract atomic insights from this document following the rules." },
      ]
    : [{ type: "text", text: inputText.slice(0, 60000) }];

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: EXTRACT_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = res.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
  }
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse JSON from extractor" }, { status: 500 });
  }
  let parsed: { insights: Insight[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Invalid JSON from extractor" }, { status: 500 });
  }
  const insights = parsed.insights ?? [];

  if (insights.length === 0) {
    return NextResponse.json({
      error: "No insights extracted from document",
      hint: "Try a doc with more domain-relevant content, or paste text instead",
    }, { status: 400 });
  }

  // Write evidence rows in Supabase. Synthesised notion_id so the existing
  // curator/synthesizer code (which keys off notion_id) works uniformly.
  const now = new Date().toISOString();
  const evidenceRows = insights.map((ins) => ({
    notion_id: `ext-${randomUUID()}`,
    title: ins.title.slice(0, 200),
    evidence_type: ins.evidence_type,
    validation_status: "Validated",
    confidence_level: ins.confidence_level,
    reusability_level: "Reusable",
    sensitivity_level: "Internal",
    evidence_statement: ins.statement,
    source_excerpt: ins.source_excerpt,
    affected_theme: ins.affected_theme,
    stakeholder_function: ins.stakeholder_function,
    project_notion_id: projectNotionId,
    case_code: finalCaseCode,
    date_captured: now.slice(0, 10),
    created_at: now,
    updated_at: now,
  }));

  const { data: insertedEv, error: evErr } = await sb.from("evidence")
    .insert(evidenceRows)
    .select("notion_id");
  if (evErr) {
    return NextResponse.json({ error: `Evidence insert failed: ${evErr.message}` }, { status: 500 });
  }
  const evidenceIds = (insertedEv as { notion_id: string }[]).map(r => r.notion_id);

  // Upsert knowledge_cases row for this code
  await sb.from("knowledge_cases").upsert({
    code: finalCaseCode,
    title: caseTitle ?? `${parsedCase.identifier} (${parsedCase.scope} ${parsedCase.year})`,
    project_notion_id: projectNotionId,
    project_name: caseTitle,
    geography: parsedCase.scope,
    year: parsedCase.year,
    evidence_count: insights.length,
    first_seen: now,
    last_seen: now,
  }, { onConflict: "code" });

  // Invoke curator synchronously on the new evidence ids
  let curatorSummary: unknown = { skipped: true };
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (req.nextUrl.origin);
    const curatorRes = await fetch(`${base}/api/knowledge-curator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-key": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ evidence_ids: evidenceIds, dry_run: false }),
    });
    if (curatorRes.ok) {
      const cur = await curatorRes.json();
      curatorSummary = {
        total: cur.total,
        applied_append: cur.applied_append,
        proposed_amend: cur.proposed_amend,
        proposed_split: cur.proposed_split,
        ignored: cur.ignored,
      };
    } else {
      curatorSummary = { error: `curator ${curatorRes.status}` };
    }
  } catch (err) {
    curatorSummary = { error: String(err).slice(0, 200) };
  }

  return NextResponse.json({
    ok: true,
    case_code: finalCaseCode,
    case_title: caseTitle,
    source_file_url: sourceFileUrl,
    storage_path: storagePath,
    source_note: sourceNote,
    insights_extracted: insights.length,
    evidence_ids: evidenceIds,
    curator_summary: curatorSummary,
  });
}

export const POST = withRoutineLog("library-ingest-to-tree", _POST);
export const GET = POST;

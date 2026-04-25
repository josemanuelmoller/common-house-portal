import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import {
  generateDigestionProposal,
  generateDigestionProposalFromText,
} from "@/lib/digest-pipeline";
import { extractDocxText, extractPptxText } from "@/lib/office-text-extract";

export const maxDuration = 300;

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const BUCKET = "library-docs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
}

type DigestKind = "pdf" | "docx" | "pptx";

function detectKindByName(name: string, mime?: string): DigestKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (mime === PDF_MIME) return "pdf";
  if (mime === DOCX_MIME) return "docx";
  if (mime === PPTX_MIME) return "pptx";
  return null;
}

/**
 * POST /api/ingest-library/digest
 *
 * Full Digest mode for strategic documents. Returns a digestion proposal
 * markdown (Phase A + B of the ingest-document skill) for admin review.
 *
 * Two intake modes:
 *   1. multipart/form-data — small files only (≤4 MB Vercel body cap):
 *      - file: PDF / DOCX / PPTX
 *      - source: optional string
 *      - scopeHints: optional JSON string
 *
 *   2. application/json — for any size; bytes already uploaded directly to
 *      Supabase via /api/ingest-library/upload-url:
 *      - storagePath: string (e.g. "library/12345-deck.pptx")
 *      - fileName: string (original file name)
 *      - source: optional string
 *      - scopeHints: optional object
 *
 * Response: { ok, proposalMarkdown, modelUsed, inputTokens, cachedTokens,
 *             outputTokens, fileName, fileSize, sourceFormat,
 *             extractedTextChars, storagePath? }
 *
 * Phase C (push to Notion) stays out of this route. The agent runs
 * notion_push.py after admin reviews + edits the proposal.
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const contentType = req.headers.get("content-type") ?? "";

  let fileBuffer: Buffer;
  let fileName: string;
  let fileMime: string | undefined;
  let fileSize: number;
  let sourceNote = "";
  let scopeHints: Record<string, unknown> = {};
  let storagePathFromUpload: string | null = null;

  if (contentType.includes("application/json")) {
    let body: {
      storagePath?: string;
      fileName?: string;
      source?: string;
      scopeHints?: Record<string, unknown>;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.storagePath || !body.fileName) {
      return NextResponse.json(
        { error: "JSON body must include storagePath and fileName" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(body.storagePath);
    if (dlErr || !blob) {
      console.error("[ingest-library/digest] Supabase download error:", dlErr);
      return NextResponse.json(
        { error: `Failed to download from Supabase: ${dlErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    const arrayBuffer = await blob.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    fileName = body.fileName;
    fileMime = blob.type || undefined;
    fileSize = fileBuffer.length;
    sourceNote = body.source ?? "";
    if (body.scopeHints && typeof body.scopeHints === "object") {
      scopeHints = { ...body.scopeHints };
    }
    storagePathFromUpload = body.storagePath;
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    fileName = file.name;
    fileMime = file.type;
    fileSize = file.size;
    sourceNote = (formData.get("source") as string | null) ?? "";
    const scopeRaw = formData.get("scopeHints") as string | null;
    if (scopeRaw) {
      try {
        const parsed = JSON.parse(scopeRaw);
        if (parsed && typeof parsed === "object") scopeHints = parsed;
      } catch {
        // ignore malformed scopeHints — proposal will be drafted from file alone
      }
    }
  } else {
    return NextResponse.json(
      { error: "Expected multipart/form-data or application/json with storagePath" },
      { status: 400 },
    );
  }

  const kind = detectKindByName(fileName, fileMime);
  if (!kind) {
    return NextResponse.json(
      {
        error: `Full Digest mode accepts PDF / DOCX / PPTX; got "${fileName}" (${fileMime || "unknown"})`,
      },
      { status: 400 },
    );
  }

  if (sourceNote && !scopeHints.source_note) {
    scopeHints.source_note = sourceNote;
  }
  if (fileName && !scopeHints.title_hint) {
    scopeHints.title_hint = fileName.replace(/\.(pdf|docx|pptx)$/i, "");
  }

  try {
    let result;
    let extractedChars: number | null = null;

    if (kind === "pdf") {
      result = await generateDigestionProposal(fileBuffer, scopeHints);
    } else {
      const extractedText =
        kind === "docx"
          ? await extractDocxText(fileBuffer)
          : await extractPptxText(fileBuffer);
      extractedChars = extractedText?.length ?? 0;
      if (extractedChars < 100) {
        return NextResponse.json(
          {
            error: `Extracted text too short (${extractedChars} chars). The ${kind.toUpperCase()} file may be empty, image-only, or corrupted. For image-heavy decks, save as PDF and re-upload.`,
          },
          { status: 422 },
        );
      }
      const augmentedHints = {
        ...scopeHints,
        _ingest_format: kind,
        _ingest_note:
          "Source file was a non-PDF Office document. Text was extracted server-side; layout, slide imagery, and chart visuals are NOT available to the drafter.",
      };
      result = await generateDigestionProposalFromText(
        extractedText,
        fileName,
        augmentedHints,
      );
    }

    return NextResponse.json({
      ok: true,
      proposalMarkdown: result.proposalMarkdown,
      proposalLengthChars: result.proposalMarkdown.length,
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      cachedTokens: result.cachedTokens,
      outputTokens: result.outputTokens,
      fileName,
      fileSize,
      sourceFormat: kind,
      extractedTextChars: extractedChars,
      storagePath: storagePathFromUpload,
    });
  } catch (err) {
    console.error("[ingest-library/digest] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest pipeline error" },
      { status: 500 },
    );
  }
}

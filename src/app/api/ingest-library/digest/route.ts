import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  generateDigestionProposal,
  generateDigestionProposalFromText,
} from "@/lib/digest-pipeline";
import { OfficeParser } from "officeparser";

export const maxDuration = 120;

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type DigestKind = "pdf" | "docx" | "pptx";

function detectKind(file: File): DigestKind | null {
  // Some browsers report empty / wrong mime for office files. Trust extension first.
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (file.type === PDF_MIME) return "pdf";
  if (file.type === DOCX_MIME) return "docx";
  if (file.type === PPTX_MIME) return "pptx";
  return null;
}

/**
 * POST /api/ingest-library/digest
 *
 * Full Digest mode for strategic documents. Uploads a PDF and returns a
 * structured digestion proposal markdown (Phase A + B of the ingest-document
 * skill) for admin review.
 *
 * Body: multipart/form-data with:
 *   - file: PDF
 *   - source: optional source/attribution string
 *   - scopeHints: optional JSON string with title_hint, publisher,
 *                 geographic_scope, partner_org, ch_relevance, etc.
 *
 * Response: { ok, proposalMarkdown, inputTokens, outputTokens, modelUsed }
 *
 * Phase C (Source + Evidence + KAs creation in Notion) is NOT done by this
 * route — it requires bidirectional linking, batched validation, and is run
 * after admin reviews + edits the proposal. Use the agent + notion_push.py
 * CLI to push (or future: a separate /digest/execute route + Supabase queue).
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with 'file' (PDF)" },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
  }
  const kind = detectKind(file);
  if (!kind) {
    return NextResponse.json(
      {
        error: `Full Digest mode accepts PDF / DOCX / PPTX; got "${file.name}" (${file.type || "unknown"})`,
      },
      { status: 400 },
    );
  }

  const sourceNote = (formData.get("source") as string | null) ?? "";
  let scopeHints: Record<string, unknown> = {};
  const scopeRaw = formData.get("scopeHints") as string | null;
  if (scopeRaw) {
    try {
      const parsed = JSON.parse(scopeRaw);
      if (parsed && typeof parsed === "object") scopeHints = parsed;
    } catch {
      // ignore malformed scopeHints — proposal will be drafted from PDF alone
    }
  }
  if (sourceNote && !scopeHints.source_note) {
    scopeHints.source_note = sourceNote;
  }
  if (file.name && !scopeHints.title_hint) {
    scopeHints.title_hint = file.name.replace(/\.pdf$/i, "");
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  try {
    let result;
    let extractedChars: number | null = null;

    if (kind === "pdf") {
      result = await generateDigestionProposal(fileBuffer, scopeHints);
    } else {
      // DOCX or PPTX — extract text via officeparser, then route through the
      // text variant. Layout / images are lost; flagged in scopeHints so the
      // drafter knows it's working from text-only content.
      const ast = await OfficeParser.parseOffice(fileBuffer);
      const extractedText = ast.toText();
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
        file.name,
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
      fileName: file.name,
      fileSize: file.size,
      sourceFormat: kind,
      extractedTextChars: extractedChars,
    });
  } catch (err) {
    console.error("[ingest-library/digest] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest pipeline error" },
      { status: 500 },
    );
  }
}

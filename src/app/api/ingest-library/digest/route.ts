import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { generateDigestionProposal } from "@/lib/digest-pipeline";

export const maxDuration = 120;

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
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: `Full Digest mode requires a PDF; got ${file.type || "unknown"}` },
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
  const pdfBuffer = Buffer.from(arrayBuffer);

  try {
    const result = await generateDigestionProposal(pdfBuffer, scopeHints);
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
    });
  } catch (err) {
    console.error("[ingest-library/digest] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest pipeline error" },
      { status: 500 },
    );
  }
}

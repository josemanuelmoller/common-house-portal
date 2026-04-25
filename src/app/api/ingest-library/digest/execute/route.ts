import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { pushProposal } from "@/lib/notion-push";
import type { DigestProposal, ProposalAnswers } from "@/types/digest-proposal";

export const maxDuration = 300;

/**
 * POST /api/ingest-library/digest/execute
 *
 * Phase C — Push the reviewed proposal to Notion (Source + Evidence + KAs +
 * bidirectional backlinks + audit append on the Source page).
 *
 * Body: {
 *   proposal: DigestProposal,
 *   answers: ProposalAnswers,
 *   storagePath?: string,
 *   pipelineMeta?: { model: string; inputTokens: number; outputTokens: number }
 * }
 *
 * Response: { ok, sourceId, sourceUrl, evidenceCount, kaCount, applied, ... }
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: {
    proposal?: DigestProposal;
    answers?: ProposalAnswers;
    storagePath?: string;
    pipelineMeta?: { model: string; inputTokens: number; outputTokens: number };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.proposal || !body.answers) {
    return NextResponse.json(
      { error: "Body must include proposal and answers" },
      { status: 400 },
    );
  }

  const p = body.proposal;
  if (!p.source?.title || !Array.isArray(p.evidence) || !Array.isArray(p.knowledge_assets)) {
    return NextResponse.json(
      { error: "Proposal is missing required fields (source / evidence / knowledge_assets)" },
      { status: 400 },
    );
  }

  const missing = (p.questions ?? [])
    .filter((q) => q.required !== false)
    .filter((q) => {
      const a = body.answers?.[q.id];
      return a === undefined || a === null || a === "";
    })
    .map((q) => q.id);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required answers for questions: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await pushProposal({
      proposal: p,
      answers: body.answers,
      storagePath: body.storagePath,
      pipelineMeta: body.pipelineMeta,
    });

    return NextResponse.json({
      ok: true,
      sourceId: result.sourceId,
      sourceUrl: result.sourceUrl,
      evidenceCount: result.evidence.length,
      kaCount: result.knowledgeAssets.length,
      evidence: result.evidence,
      knowledgeAssets: result.knowledgeAssets,
    });
  } catch (err) {
    console.error("[ingest-library/digest/execute] push error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Phase C push failed" },
      { status: 500 },
    );
  }
}

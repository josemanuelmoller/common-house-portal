import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
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
 *   storagePath?: string  // for the Source URL signed-link generation
 * }
 *
 * Currently a STUB — returns 501 until src/lib/notion-push.ts ships.
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { proposal?: DigestProposal; answers?: ProposalAnswers; storagePath?: string };
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

  // Light validation that survives until commit 2 (Phase C TS port)
  const p = body.proposal;
  if (!p.source?.title || !Array.isArray(p.evidence) || !Array.isArray(p.knowledge_assets)) {
    return NextResponse.json(
      { error: "Proposal is missing required fields (source / evidence / knowledge_assets)" },
      { status: 400 },
    );
  }

  // Verify all required questions have answers
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

  return NextResponse.json(
    {
      error: "Phase C push to Notion not yet implemented in TS. Use the agent CLI for now.",
      proposalSummary: {
        source_title: p.source.title,
        evidence_count: p.evidence.length,
        ka_count: p.knowledge_assets.length,
        question_count: p.questions?.length ?? 0,
        answers_received: Object.keys(body.answers).length,
      },
    },
    { status: 501 },
  );
}

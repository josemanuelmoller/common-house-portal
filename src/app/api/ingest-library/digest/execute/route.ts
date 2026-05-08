import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { DigestProposal, ProposalAnswers } from "@/types/digest-proposal";

export const maxDuration = 300;

/**
 * POST /api/ingest-library/digest/execute
 *
 * Persist a reviewed digest proposal as canonical Supabase rows:
 *   - public.sources                — one row for the document
 *   - public.evidence               — one row per atomic insight
 *   - public.knowledge_assets       — one row per proposed asset
 *
 * Replaces the legacy "Phase C — push to Notion" path that was retired
 * ahead of the 2026-06-02 freeze cutoff. The previous implementation
 * (notion-push.ts → notion.pages.create + bidirectional backlinks + audit
 * append) is gone; new sources are routed through Supabase and the
 * /api/library/ingest-to-tree pipeline picks up curator handoff.
 *
 * Body: {
 *   proposal: DigestProposal,
 *   answers: ProposalAnswers,
 *   storagePath?: string,
 *   pipelineMeta?: { model: string; inputTokens: number; outputTokens: number }
 * }
 *
 * Response: { ok, sourceId, sourceUrl, evidenceCount, kaCount, ... }
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
    const sb = getSupabaseServerClient();
    const sourceUrl = body.storagePath
      ? `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "")}/storage/v1/object/public/library-docs/${body.storagePath}`
      : null;

    // 1. Source row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceFields: Record<string, any> = {
      title: p.source.title,
      source_type: p.source.source_type ?? "Library",
      source_url: sourceUrl,
      processing_status: "Processed",
      relevance_status: "Relevant",
    };
    const { data: sourceRow, error: sourceErr } = await sb
      .from("sources")
      .insert(sourceFields)
      .select("id")
      .single();
    if (sourceErr) {
      console.error("[ingest-library/digest/execute] source insert failed:", sourceErr.message);
      return NextResponse.json({ error: "Source insert failed", detail: sourceErr.message }, { status: 500 });
    }
    const sourceId = (sourceRow as { id: string }).id;

    // 2. Evidence rows — one per atomic insight
    const evidenceRows = p.evidence.map((e, idx) => ({
      source_id: sourceId,
      title: e.title ?? `Evidence ${idx + 1}`,
      statement: e.statement ?? "",
      source_excerpt: e.source_excerpt ?? null,
      evidence_type: e.evidence_type ?? "Insight Candidate",
      confidence_level: e.confidence ?? "Medium",
      validation_status: "Validated",
      affected_theme: e.affected_themes?.[0] ?? null,
    }));
    let evidenceInserted: { id: string; index: number; title: string }[] = [];
    if (evidenceRows.length > 0) {
      const { data: evRows, error: evErr } = await sb
        .from("evidence")
        .insert(evidenceRows)
        .select("id, title");
      if (evErr) {
        console.error("[ingest-library/digest/execute] evidence insert failed:", evErr.message);
      } else {
        evidenceInserted = (evRows as { id: string; title: string }[]).map((r, i) => ({
          id: r.id,
          index: i,
          title: r.title,
        }));
      }
    }

    // 3. Knowledge asset rows — proposal-stage candidates
    const kaRows = p.knowledge_assets.map((ka) => ({
      title: ka.name ?? "Untitled asset",
      asset_type: ka.asset_type ?? "Insight",
      summary: ka.summary ?? null,
      body_md: ka.main_body ?? null,
      status: "Draft",
    }));
    let kasInserted: { id: string; index: number; name: string }[] = [];
    if (kaRows.length > 0) {
      const { data: kRows, error: kErr } = await sb
        .from("knowledge_assets")
        .insert(kaRows)
        .select("id, title");
      if (kErr) {
        console.error("[ingest-library/digest/execute] ka insert failed:", kErr.message);
      } else {
        kasInserted = (kRows as { id: string; title: string }[]).map((r, i) => ({
          id: r.id,
          index: i,
          name: r.title,
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      sourceId,
      sourceUrl: sourceUrl ?? "supabase://sources/" + sourceId,
      evidenceCount: evidenceInserted.length,
      kaCount: kasInserted.length,
      evidence: evidenceInserted.map((e) => ({ id: e.id, url: "", index: e.index, title: e.title })),
      knowledgeAssets: kasInserted.map((k) => ({ id: k.id, url: "", index: k.index, name: k.name })),
      linkedOrgs: [],
    });
  } catch (err) {
    console.error("[ingest-library/digest/execute] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest execute failed" },
      { status: 500 },
    );
  }
}

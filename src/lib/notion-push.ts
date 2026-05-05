// DEPRECATED: scheduled for deletion at Phase 6 cutoff 2026-06-02. See docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.7. Functions here are no-ops; the canonical Supabase write happens at the call site upstream.
/**
 * notion-push.ts — Phase C TS port (DEPRECATED).
 *
 * Original purpose: push a reviewed DigestProposal to Notion as Source +
 * Evidence batch + Knowledge Asset candidates with bidirectional backlinks
 * and an audit summary appended to the Source page body.
 *
 * NOTE (2026-05-05): all Notion `pages.create` / `blocks.children.append`
 * calls in this file are now no-ops. After Phase 6 cutoff (2026-06-02)
 * Notion is read-only; the canonical write target for digest output is
 * Supabase (`sources`, `evidence`, `knowledge_assets`). The digest
 * pipeline upstream of `pushProposal` is being migrated to write Supabase
 * directly — see `docs/migration/PHASE_4_5_INVENTORY.md` row 15.
 *
 * The original Notion call code is preserved as commented-out blocks below
 * with a `notion-cutoff-2026-06-02` marker so a Phase 6 sweep can confirm
 * and delete the file.
 */

// notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
// import { Client } from "@notionhq/client";
// import { DB } from "@/lib/notion/core";
import type {
  DigestProposal,
  ProposalAnswers,
  ProposalQuestion,
} from "@/types/digest-proposal";

export type PushResult = {
  sourceId: string;
  sourceUrl: string;
  evidence: { id: string; url: string; index: number; title: string }[];
  knowledgeAssets: { id: string; url: string; index: number; name: string }[];
  linkedOrgs: { name: string; id: string }[];
};

export async function pushProposal(args: {
  proposal: DigestProposal;
  answers: ProposalAnswers;
  storagePath?: string | null;
  pipelineMeta?: { model: string; inputTokens: number; outputTokens: number };
}): Promise<PushResult> {
  const evidenceCount = args.proposal?.evidence?.length ?? 0;
  const kaCount = args.proposal?.knowledge_assets?.length ?? 0;

  console.warn(
    "[notion-mirror-deprecated] pushProposal no-op — Notion writes are decommissioned at Phase 6 cutoff 2026-06-02. Would have pushed:",
    {
      sourceTitle: args.proposal?.source?.title,
      evidenceCount,
      kaCount,
      linkedOrgsRequested: args.proposal?.source?.linked_organizations ?? [],
      storagePath: args.storagePath ?? null,
      pipelineMeta: args.pipelineMeta ?? null,
    },
  );

  // notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
  // const notion = getNotionClient();
  // const { proposal, appliedLog } = applyAnswers(args.proposal, args.answers);
  // const sourceUrlForFile: string | null = args.storagePath
  //   ? `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "")}/storage/v1/object/public/library-docs/${args.storagePath}`
  //   : null;
  // const source = await createSource(notion, proposal, sourceUrlForFile);
  // const evidence = await createEvidence(notion, proposal.evidence, source.id);
  // const kas = await createKnowledgeAssets(notion, proposal.knowledge_assets, evidence);
  // await backlinkEvidenceToKAs(notion, proposal.evidence, evidence, kas);
  // const audit = buildAuditMarkdown({ proposal, answers: args.answers, appliedLog, evidence, kas, linkedOrgs: source.linkedOrgs, pipelineMeta: args.pipelineMeta ?? { model: "unknown", inputTokens: 0, outputTokens: 0 } });
  // await appendAudit(notion, source.id, audit);

  // Return the same shape callers expect. No Notion IDs are minted because
  // no record was created; downstream code that surfaces sourceUrl will see
  // a deprecated:// marker and can branch on it.
  return {
    sourceId: "deprecated",
    sourceUrl: "deprecated://phase-6-cutoff-2026-06-02",
    evidence: [],
    knowledgeAssets: [],
    linkedOrgs: [],
  };
}

export type { ProposalQuestion };

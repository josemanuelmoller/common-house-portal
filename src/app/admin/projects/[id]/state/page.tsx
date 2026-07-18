import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { CurrentStateEditor, LearningManager, StateItemsManager } from "@/components/project-state/ProjectStateManager";
import { StateProposals, type ProposalCard } from "@/components/project-state/StateProposals";
import { getProjectStateView } from "@/lib/project-state";
import { listPendingProposals, type StateProposal } from "@/lib/state-proposals";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

function previewOf(p: StateProposal): string | null {
  const payload = p.payload ?? {};
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);
  switch (p.proposalKind) {
    case "add_item": return s("statement");
    case "update_item":
    case "resolve_item": return [s("status"), s("resolution_note"), s("owner_label")].filter(Boolean).join(" · ") || null;
    case "state_summary": return [s("current_summary"), s("current_phase"), s("current_focus"), s("health")].filter(Boolean).join(" · ") || null;
    case "add_learning": return [s("title"), s("observation")].filter(Boolean).join(" — ") || null;
    default: return null;
  }
}

export default async function ProjectStatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const view = await getProjectStateView(id);
  if (!view) redirect("/admin/workrooms");

  const pending = await listPendingProposals(view.projectId);
  const proposals: ProposalCard[] = pending.map((p) => ({
    id: p.id,
    proposalKind: p.proposalKind,
    itemType: p.itemType,
    summary: p.summary,
    rationale: p.rationale,
    impact: p.impact,
    confidence: p.confidence,
    sourceCount: p.sourceRefs.length,
    targetStatement: p.targetStatement,
    payloadPreview: previewOf(p),
  }));

  const activeItems = view.items.filter((item) => item.status === "active").length;
  const candidateLearnings = view.learnings.filter((item) => item.transferability === "candidate" || item.transferability === "confirmed").length;
  return <PortalShell
    eyebrow={{ label: "PROJECT", accent: "CURRENT MODEL" }}
    title={view.projectName}
    period={false}
    subtitle="The operating model is deliberately smaller than the transcript history. Keep only claims that are current, sourced and useful; let the rest resolve, expire or stay in raw evidence."
    meta={<div className="flex items-center gap-3"><span>{activeItems} ACTIVE CLAIMS</span><Link className="hover:underline" href={`/admin/projects/${id}`}>← Project</Link></div>}
    metaMobile={<Link className="text-[10px]" href={`/admin/projects/${id}`}>← Project</Link>}
    narrow
    bodySpacing={8}
  >
    <HallSection title="Proposed" flourish="updates" meta={`${proposals.length} PENDING`}>
      <StateProposals projectId={view.projectId} proposals={proposals} />
    </HallSection>
    <HallSection title="Current" flourish="state" meta={view.state?.stateStatus?.toUpperCase() ?? "NOT STARTED"}>
      <CurrentStateEditor view={view} />
    </HallSection>
    <HallSection title="What remains" flourish="true" meta={`${activeItems} ACTIVE`}>
      <StateItemsManager view={view} />
    </HallSection>
    <HallSection title="Implementation" flourish="learning" meta={`${candidateLearnings} CANDIDATES`}>
      <LearningManager view={view} />
    </HallSection>
  </PortalShell>;
}

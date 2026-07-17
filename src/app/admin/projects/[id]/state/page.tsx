import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { CurrentStateEditor, LearningManager, StateItemsManager } from "@/components/project-state/ProjectStateManager";
import { getProjectStateView } from "@/lib/project-state";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ProjectStatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const view = await getProjectStateView(id);
  if (!view) redirect("/admin/workrooms");

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

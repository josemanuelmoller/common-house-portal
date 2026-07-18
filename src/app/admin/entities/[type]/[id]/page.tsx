import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { requireAdmin } from "@/lib/require-admin";
import { getEntityView } from "@/lib/entity-links";

export const dynamic = "force-dynamic";

/**
 * Cross-project entity view (Phase 6): everything a person or organization is
 * linked to across the project memory — the enabler for the person/org lens.
 */
export default async function EntityPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireAdmin();
  const { type, id } = await params;
  if (type !== "person" && type !== "organization") notFound();
  const view = await getEntityView(type, id);
  if (!view) notFound();

  const stateItems = view.items.filter((i) => i.subjectType === "state_item");
  const learnings = view.items.filter((i) => i.subjectType === "learning_item");

  return <PortalShell
    eyebrow={{ label: view.entityType === "person" ? "PERSON" : "ORGANIZATION", accent: "ACROSS PROJECTS" }}
    title={view.entityName}
    period={false}
    subtitle="What this entity is connected to across the project memory — the claims, signals and learnings where they are owner or stakeholder."
    meta={`${view.items.length} LINK${view.items.length === 1 ? "" : "S"}`}
    narrow
    bodySpacing={8}
  >
    <HallSection title="State" flourish="claims" meta={`${stateItems.length}`}>
      {stateItems.length === 0
        ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No linked state claims yet.</p>
        : <div>{stateItems.map((it) => <Link key={`${it.subjectId}:${it.relation}`} href={`/admin/projects/${it.projectId}/state`} className="block py-3 hover:opacity-70" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
            <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{it.projectName ?? "Project"} · {it.itemKind.replaceAll("_", " ")} · {it.relation} · {it.status}</p>
            <p className="mt-1 text-[13px] font-semibold">{it.statement}</p>
          </Link>)}</div>}
    </HallSection>
    <HallSection title="Implementation" flourish="learnings" meta={`${learnings.length}`}>
      {learnings.length === 0
        ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No linked implementation learnings yet.</p>
        : <div>{learnings.map((it) => <Link key={`${it.subjectId}:${it.relation}`} href={`/admin/projects/${it.projectId}/state`} className="block py-3 hover:opacity-70" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
            <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{it.projectName ?? "Project"} · {it.itemKind.replaceAll("_", " ")} · {it.relation}</p>
            <p className="mt-1 text-[13px] font-semibold">{it.statement}</p>
          </Link>)}</div>}
    </HallSection>
  </PortalShell>;
}

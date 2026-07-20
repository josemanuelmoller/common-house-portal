import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import {
  AgreementsManager,
  BillingManager,
  ClientAccessManager,
  ClientMaterialsManager,
  ClientRoomSettings,
  NarrativeManager,
  TimelineManager,
} from "@/components/client-room/ClientRoomManager";
import { getClientRoomAdminData } from "@/lib/client-room";
import { getOnboardingReadiness } from "@/lib/portal-health";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ClientRoomAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const room = await getClientRoomAdminData(id);
  if (!room) redirect("/admin/workrooms");
  const readiness = await getOnboardingReadiness(id);
  const readyCount = readiness ? readiness.checks.filter((c) => c.ok).length : 0;
  const readyTotal = readiness ? readiness.checks.length : 0;

  return (
    <PortalShell
      eyebrow={{ label: "PROJECT", accent: "CLIENT ROOM" }}
      title={room.name}
      period={false}
      subtitle="Control exactly what the client can see, respond to and approve. Drive files stay internal until you explicitly share them."
      meta={<div className="flex items-center gap-3"><span>{room.roomEnabled ? "ROOM ON" : "ROOM OFF"}</span>{room.slug && <a href={`/hall/${room.slug}`} target="_blank" rel="noreferrer" className="hover:underline">View as client ↗</a>}<Link href={`/admin/projects/${id}`} className="hover:underline">← Project</Link></div>}
      metaMobile={<div className="flex items-center gap-3">{room.slug && <a href={`/hall/${room.slug}`} target="_blank" rel="noreferrer" className="text-[10px]">Client ↗</a>}<Link href={`/admin/projects/${id}`} className="text-[10px]">← Project</Link></div>}
      narrow
      bodySpacing={8}
    >
      {readiness && (
        <HallSection title="Onboarding" flourish="readiness" meta={`${readyCount}/${readyTotal} READY`}>
          <p className="text-[12px] mb-3" style={{ color: readiness.ready ? "var(--hall-muted-2)" : "var(--hall-ink-3)" }}>
            {readiness.ready
              ? "This room clears the checklist — safe to invite the client."
              : "Complete these before inviting a client. Nothing here sends anything on its own."}
          </p>
          <div>
            {readiness.checks.map((c) => (
              <div key={c.key} className="flex flex-wrap items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                <span className={c.ok ? "hall-chip-dark" : "hall-chip-outline"}>{c.ok ? "✓" : "—"}</span>
                <strong className="flex-1 min-w-[180px] text-[13px]">{c.label}</strong>
                <span className="text-[10px] uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{c.detail}</span>
              </div>
            ))}
          </div>
        </HallSection>
      )}

      <HallSection title="Room" flourish="settings" meta={room.slug ? `/${room.slug}` : "NO SLUG"}>
        <ClientRoomSettings room={room} />
      </HallSection>

      <HallSection title="Narrative" flourish="the story" meta="ROOM CONTENT">
        <NarrativeManager room={room} />
      </HallSection>

      <HallSection title="Client" flourish="access" meta="PROJECT SCOPED">
        <ClientAccessManager slug={room.slug} hasDrive={!!room.driveFolderId} />
      </HallSection>

      <HallSection title="Working" flourish="together" meta={`${room.timelineEvents.length} EVENTS`}>
        <TimelineManager room={room} />
      </HallSection>

      <HallSection title="Agreements" flourish="and approvals" meta={`${room.agreements.length} RECORDED`}>
        <AgreementsManager room={room} />
      </HallSection>

      <HallSection title="Project" flourish="materials" meta={`${room.materials.length} INDEXED`}>
        <ClientMaterialsManager room={room} />
      </HallSection>

      <HallSection title="Administrative" flourish="billing" meta="GLOBAL · APPROVER-GATED">
        <BillingManager room={room} />
      </HallSection>
    </PortalShell>
  );
}

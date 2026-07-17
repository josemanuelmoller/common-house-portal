import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import {
  AgreementsManager,
  ClientAccessManager,
  ClientMaterialsManager,
  ClientRoomSettings,
} from "@/components/client-room/ClientRoomManager";
import { getClientRoomAdminData } from "@/lib/client-room";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ClientRoomAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const room = await getClientRoomAdminData(id);
  if (!room) redirect("/admin/workrooms");

  return (
    <PortalShell
      eyebrow={{ label: "PROJECT", accent: "CLIENT ROOM" }}
      title={room.name}
      period={false}
      subtitle="Control exactly what the client can see, respond to and approve. Drive files stay internal until you explicitly share them."
      meta={<div className="flex items-center gap-3"><span>{room.roomEnabled ? "ROOM ON" : "ROOM OFF"}</span><Link href={`/admin/projects/${id}`} className="hover:underline">← Project</Link></div>}
      metaMobile={<Link href={`/admin/projects/${id}`} className="text-[10px]">← Project</Link>}
      narrow
      bodySpacing={8}
    >
      <HallSection title="Room" flourish="settings" meta={room.slug ? `/${room.slug}` : "NO SLUG"}>
        <ClientRoomSettings room={room} />
      </HallSection>

      <HallSection title="Client" flourish="access" meta="PROJECT SCOPED">
        <ClientAccessManager slug={room.slug} hasDrive={!!room.driveFolderId} />
      </HallSection>

      <HallSection title="Agreements" flourish="and approvals" meta={`${room.agreements.length} RECORDED`}>
        <AgreementsManager room={room} />
      </HallSection>

      <HallSection title="Project" flourish="materials" meta={`${room.materials.length} INDEXED`}>
        <ClientMaterialsManager room={room} />
      </HallSection>
    </PortalShell>
  );
}

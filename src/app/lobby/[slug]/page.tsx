import { notFound } from "next/navigation";
import { ClientRoomView } from "@/components/client-room/ClientRoomView";
import { getClientRoomBySlug } from "@/lib/client-room";
import { requireClientAccessForSlug } from "@/lib/require-client-access";

export const dynamic = "force-dynamic";

export default async function HallSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Authentication and project-scoped authorization happen before any room data is read.
  const access = await requireClientAccessForSlug(slug);
  const canSeeBank = access.kind === "admin" || (access.kind === "client" && access.grant.role === "approver");
  const room = await getClientRoomBySlug(slug, { canSeeBank });
  if (!room) notFound();

  return (
    <ClientRoomView
      room={room}
      role={access.kind === "client" ? access.grant.role : null}
      adminPreview={access.kind === "admin"}
    />
  );
}

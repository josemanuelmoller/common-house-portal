import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { InboxList, type InboxRowForList } from "@/components/capture/InboxList";
import { listInboxItems, signInboxMediaUrl } from "@/lib/inbox";

export const metadata = {
  title: "Bandeja — Common House",
};

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  "new",
  "classifying",
  "classified",
  "needs_review",
  "pending_action",
] as const;

export default async function CapturePage() {
  await requireAdmin();

  const [activeRes, doneRes] = await Promise.all([
    listInboxItems({ status: [...ACTIVE_STATUSES], limit: 100 }),
    listInboxItems({ status: ["done", "archived"], limit: 25 }),
  ]);

  const activeItems = await enrichWithMedia(activeRes.rows);
  const doneItems = await enrichWithMedia(doneRes.rows);

  const needsReview = activeItems.filter((r) => r.status === "needs_review");
  const pending = activeItems.filter((r) => r.status === "pending_action");
  const fresh = activeItems.filter(
    (r) => r.status === "new" || r.status === "classifying" || r.status === "classified"
  );

  return (
    <PortalShell
      eyebrow={{
        label: "INBOX",
        accent: `${activeItems.length} ACTIVOS`,
      }}
      title="Bandeja"
      flourish="capturada"
      meta={
        <Link
          href="/admin/capture/new"
          className="text-[11px] underline tracking-[0.06em]"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-ink-0)",
          }}
        >
          + NUEVA CAPTURA
        </Link>
      }
    >
      {needsReview.length > 0 && (
        <HallSection
          title="Necesitan revisión"
          flourish="del agente"
          meta={`${needsReview.length}`}
        >
          <InboxList rows={needsReview} />
        </HallSection>
      )}

      {pending.length > 0 && (
        <HallSection
          title="Pendientes"
          flourish="de acción"
          meta={`${pending.length}`}
        >
          <InboxList rows={pending} />
        </HallSection>
      )}

      <HallSection
        title="Sin clasificar"
        flourish="aún"
        meta={`${fresh.length}`}
      >
        <InboxList
          rows={fresh}
          emptyMessage="Bandeja vacía. Apretá +."
        />
      </HallSection>

      {doneItems.length > 0 && (
        <HallSection
          title="Hechos"
          flourish="recientes"
          meta={`${doneItems.length}`}
        >
          <InboxList rows={doneItems} />
        </HallSection>
      )}
    </PortalShell>
  );
}

async function enrichWithMedia(
  rows: Awaited<ReturnType<typeof listInboxItems>>["rows"]
): Promise<InboxRowForList[]> {
  const out: InboxRowForList[] = [];
  for (const r of rows) {
    const photo_url = r.photo_path ? (await signInboxMediaUrl(r.photo_path)).url : null;
    const audio_url = r.audio_path ? (await signInboxMediaUrl(r.audio_path)).url : null;
    out.push({
      id: r.id,
      created_at: r.created_at,
      source: r.source,
      raw_text: r.raw_text,
      user_notes_to_agent: r.user_notes_to_agent,
      user_type_override: r.user_type_override,
      user_due_date: r.user_due_date,
      photo_path: r.photo_path,
      audio_path: r.audio_path,
      agent_type: r.agent_type,
      agent_priority: r.agent_priority,
      agent_due_date: r.agent_due_date,
      agent_confidence: r.agent_confidence,
      status: r.status,
      photo_url,
      audio_url,
    });
  }
  return out;
}

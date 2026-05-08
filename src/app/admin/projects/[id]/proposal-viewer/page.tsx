/**
 * /admin/projects/[id]/proposal-viewer
 *
 * Embeds a static HTML deck (the design-handoff bundle in
 * `public/proposals/<slug>/index.html`) inside an iframe with fullscreen +
 * open-in-new-tab controls. Deck slug is taken from `?deck=<slug>` and
 * validated against an allowlist so we never pass arbitrary paths.
 *
 * Auth: requireAdmin (admin-only). Eventually a public share variant can live
 * at `/proposals/[slug]` for sending the link to the prospect.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { ProposalDeckFrame } from "@/components/ProposalDeckFrame";

// Allowlist — every deck we ship must be registered here. The slug is
// `public/proposals/<slug>/index.html`. Extend this list when a new deck is
// dropped into `public/proposals/`.
const DECKS: Record<string, { title: string; aspect: "16:9" | "4:3"; subtitle?: string }> = {
  "kinko-reuso-caminos-posibles": {
    title: "Reuso en Kinko · Caminos posibles",
    aspect: "16:9",
    subtitle: "Documento de exploración · Mayo 2026 · v.01",
  },
};

export default async function ProposalViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ deck?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { deck } = await searchParams;

  const slug = deck && DECKS[deck] ? deck : null;
  if (!slug) redirect(`/admin/projects/${id}`);

  const config = DECKS[slug];
  const deckUrl = `/proposals/${slug}/index.html`;

  return (
    <PortalShell
      eyebrow={{ label: "PROJECT · PROPOSAL VIEWER", accent: slug.toUpperCase() }}
      title={config.title}
      meta={
        <>
          <Link href={`/admin/projects/${id}`} className="hover:underline">← Back to project</Link>
        </>
      }
    >
      <HallSection
        title="Deck"
        flourish="preview"
        meta={
          <a
            href={deckUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5 }}
          >
            OPEN IN NEW TAB ↗
          </a>
        }
      >
        {config.subtitle && (
          <p
            className="mb-3"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10.5,
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            {config.subtitle.toUpperCase()}
          </p>
        )}
        <ProposalDeckFrame src={deckUrl} aspect={config.aspect} title={config.title} />
      </HallSection>
    </PortalShell>
  );
}

/**
 * /admin/projects/[id]/hall-compose
 *
 * Review surface for hall_draft. Server component reads the project + draft
 * from Supabase and hands it to a client component for editing/regen/publish.
 *
 * Proposal-first: nothing the admin does on this page hits the live Hall until
 * "Publish" is clicked. Discard / regenerate / edit are all reversible.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { HallDraftReviewClient } from "@/components/HallDraftReviewClient";
import type { HallDraft } from "@/lib/hall-compose";

export const dynamic = "force-dynamic";

export default async function HallComposePage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const sb = getSupabaseServerClient();
  const { data: project } = await sb
    .from("projects")
    .select("notion_id, name, hall_draft, hall_draft_status, hall_draft_generated_at, hall_hero, hall_published_at, project_status, current_stage, engagement_model")
    .eq("notion_id", id)
    .maybeSingle();

  if (!project) redirect("/admin/workrooms");

  const draft = (project.hall_draft as HallDraft | null) ?? null;
  const hero  = (project.hall_hero as HallDraft | null) ?? null;
  const status = (project.hall_draft_status as string) ?? "none";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />
      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              <Link href={`/admin/projects/${id}`} className="hover:underline">PROJECT</Link>
              {" · "}HALL COMPOSE
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {project.name}
            </h1>
          </div>
          <div
            className="flex items-center gap-3"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}
          >
            <span>
              status: <b style={{ color: "var(--hall-ink-0)" }}>{status}</b>
            </span>
            {hero && (
              <span style={{ color: "var(--hall-muted-3)" }}>
                · live since {project.hall_published_at ? new Date(project.hall_published_at as string).toLocaleDateString("en-GB") : "—"}
              </span>
            )}
          </div>
        </header>

        <div className="px-9 py-7 max-w-5xl space-y-6">
          <HallDraftReviewClient
            projectId={id}
            initialDraft={draft}
            initialStatus={status}
            generatedAt={(project.hall_draft_generated_at as string | null) ?? null}
            hasLiveHero={!!hero}
          />
        </div>
      </main>
    </div>
  );
}

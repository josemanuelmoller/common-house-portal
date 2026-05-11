// Client-scoped Hall — /hall/[slug]
//
// Renders a single project from Supabase, gated by client_access table.
// Designed for pre-sale prospect demos: focused on welcome + discovery
// synthesis + next steps. Hides internal-only fields (agent drafts, raw
// evidence, internal pricing) by reading ONLY the hall_* columns of the
// projects row.
//
// Auth: requireClientAccessForSlug — admin passes, granted user passes,
// everyone else redirected.

import { notFound } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { requireClientAccessForSlug } from "@/lib/require-client-access";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string | null;
  hall_slug: string | null;
  project_status: string | null;
  current_stage: string | null;
  geography: string | null;
  themes: string | null;
  hall_welcome_note: string | null;
  hall_current_focus: string | null;
  hall_next_milestone: string | null;
  hall_challenge: string | null;
  hall_matters_most: string | null;
  hall_obstacles: string | null;
  hall_success: string | null;
};

async function loadProject(slug: string): Promise<ProjectRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("projects")
    .select(
      "id, name, hall_slug, project_status, current_stage, geography, themes, hall_welcome_note, hall_current_focus, hall_next_milestone, hall_challenge, hall_matters_most, hall_obstacles, hall_success"
    )
    .eq("hall_slug", slug)
    .maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 mb-4 border-b border-black/10 pb-3">
        <span className="text-[11px] font-mono text-black/30 tabular-nums">{num}</span>
        <h2 className="text-[20px] font-light tracking-[-0.4px]">{title}</h2>
      </div>
      <div className="text-[15px] leading-[1.65] text-black/75">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-[1.2px] font-bold text-black/45 mb-2">
        {label}
      </div>
      <div className="text-[15px] leading-[1.65] text-black/75 whitespace-pre-line">
        {value}
      </div>
    </div>
  );
}

export default async function HallSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await requireClientAccessForSlug(slug);
  const project = await loadProject(slug);
  if (!project) notFound();

  const isAdmin = access.kind === "admin";
  const stage = project.current_stage || project.project_status || null;

  const anyHeard =
    project.hall_challenge ||
    project.hall_matters_most ||
    project.hall_obstacles ||
    project.hall_success;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--hall-paper-1, #f4f4ef)",
        color: "var(--hall-ink-0, #0a0a0a)",
        fontFamily: "var(--font-hall-sans)",
      }}
    >
      <div className="max-w-[760px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <header className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[1.5px] font-bold text-black/45">
              Common House — Hall
            </div>
            <SignOutButton>
              <button
                type="button"
                className="text-[11px] uppercase tracking-[1px] font-bold text-black/45 hover:text-black/80"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
          <h1 className="text-[36px] sm:text-[44px] font-light tracking-[-1.4px] leading-[1.05] mb-4">
            {project.name ?? "Your project"}
          </h1>
          <div className="flex flex-wrap gap-3 items-center text-[12px] text-black/55">
            {stage && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                style={{ borderColor: "rgba(0,0,0,0.18)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#c6f24a]" />
                {stage}
              </span>
            )}
            {project.geography && (
              <span className="text-black/50">{project.geography}</span>
            )}
            {project.themes && (
              <span className="text-black/40 text-[11px] font-mono">
                {project.themes}
              </span>
            )}
            {isAdmin && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.5px]"
                style={{ background: "#0a0a0a", color: "#c6f24a" }}
              >
                Admin preview
              </span>
            )}
          </div>
        </header>

        {/* ── Welcome ──────────────────────────────────────────────────────── */}
        {project.hall_welcome_note && (
          <div
            className="mb-12 p-6 rounded-[14px] border bg-white"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
          >
            <div className="text-[11px] uppercase tracking-[1.2px] font-bold text-black/45 mb-3">
              Welcome
            </div>
            <p className="text-[16px] leading-[1.65] text-black/80 whitespace-pre-line">
              {project.hall_welcome_note}
            </p>
          </div>
        )}

        {/* ── Where we are right now ───────────────────────────────────────── */}
        {(project.hall_current_focus || project.hall_next_milestone) && (
          <Section num="01" title="Where we are right now">
            <Field label="Current focus" value={project.hall_current_focus} />
            <Field label="Next milestone" value={project.hall_next_milestone} />
          </Section>
        )}

        {/* ── What we heard ────────────────────────────────────────────────── */}
        {anyHeard && (
          <Section num="02" title="What we heard">
            <Field label="The challenge" value={project.hall_challenge} />
            <Field label="What matters most" value={project.hall_matters_most} />
            <Field label="What may be in the way" value={project.hall_obstacles} />
            <Field label="What success could look like" value={project.hall_success} />
          </Section>
        )}

        {/* ── Empty state when no Hall fields populated yet ────────────────── */}
        {!project.hall_welcome_note &&
          !project.hall_current_focus &&
          !project.hall_next_milestone &&
          !anyHeard && (
            <div className="border border-dashed border-black/15 rounded-[14px] p-8 text-center">
              <div className="text-[13px] text-black/55 mb-2">
                Your Hall is being prepared.
              </div>
              <div className="text-[12px] text-black/45 leading-relaxed">
                Your Common House contact is putting together the first view of
                your project. Check back shortly.
              </div>
            </div>
          )}

        {/* ── Contact ──────────────────────────────────────────────────────── */}
        <Section num="03" title="Contact">
          <p>
            Questions or anything you&apos;d like to add?{" "}
            <a
              href="mailto:josemanuel@wearecommonhouse.com"
              className="underline hover:text-black"
            >
              josemanuel@wearecommonhouse.com
            </a>
          </p>
        </Section>

        <footer className="text-[11px] text-black/35 leading-relaxed border-t border-black/10 pt-6 mt-12">
          <div>Prepared by Common House</div>
          <div className="mt-1">
            <a href="/trust" className="underline hover:text-black/60">
              Trust
            </a>
            {" · "}
            <a href="/status" className="underline hover:text-black/60">
              Status
            </a>
            {" · "}
            <a href="/security" className="underline hover:text-black/60">
              Security
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Client-scoped Hall — /hall/[slug]
//
// Renders a single project from Supabase, gated by client_access. Reads:
//  - hall_hero (rich JSONB from compose flow) → quote, angles, listening,
//    proposal, timeline via <HallComposedHero>
//  - flat hall_* columns → welcome + what we heard prose fallback
//
// Designed for prospect demos: focused, polished, hides ALL internal data
// (agent drafts, raw evidence, internal notes) by reading ONLY the hall_*
// surface.
//
// Auth: requireClientAccessForSlug — admin passes, granted user passes,
// everyone else redirected.

import { notFound } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { requireClientAccessForSlug } from "@/lib/require-client-access";
import { supabaseAdmin } from "@/lib/supabase";
import { HallComposedHero } from "@/components/hall/HallComposedHero";
import { withDraftDefaults } from "@/lib/hall-compose-shared";
import type { HallDraft } from "@/lib/hall-compose-shared";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string | null;
  hall_slug: string | null;
  project_status: string | null;
  current_stage: string | null;
  geography: string | null;
  themes: string | null;
  hall_hero: HallDraft | null;
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
      "id, name, hall_slug, project_status, current_stage, geography, themes, hall_hero, hall_welcome_note, hall_current_focus, hall_next_milestone, hall_challenge, hall_matters_most, hall_obstacles, hall_success"
    )
    .eq("hall_slug", slug)
    .maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="mb-6">
      <div
        className="mb-2"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        · {label.toUpperCase()}
      </div>
      <div
        className="text-[15px] leading-[1.65] whitespace-pre-line"
        style={{ color: "var(--hall-ink-3)" }}
      >
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
  const projectName = project.name ?? "Your project";

  // Normalize the hero so missing optional fields don't crash the renderer.
  const hero: HallDraft | null = project.hall_hero
    ? withDraftDefaults(project.hall_hero)
    : null;

  const anyHeard =
    project.hall_challenge ||
    project.hall_matters_most ||
    project.hall_obstacles ||
    project.hall_success;

  // ── topics list (small badge row above hero, if topics are present) ──
  const topicNames =
    hero?.topics
      ?.slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((t) => t.name) ?? [];

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--hall-paper-1, #f4f4ef)",
        color: "var(--hall-ink-0, #0a0a0a)",
        fontFamily: "var(--font-hall-sans)",
      }}
    >
      {/* ── Top chrome ─────────────────────────────────────────────────────── */}
      <div
        className="border-b"
        style={{ borderColor: "var(--hall-line-soft, rgba(0,0,0,0.08))" }}
      >
        <div className="max-w-5xl mx-auto px-9 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--hall-lime, #c6f24a)" }}
            />
            <span
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--hall-ink-0)",
              }}
            >
              Common House — Hall
            </span>
            {isAdmin && (
              <span
                className="px-2 py-0.5"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  background: "#0a0a0a",
                  color: "#c6f24a",
                  borderRadius: 2,
                }}
              >
                ADMIN PREVIEW
              </span>
            )}
          </div>
          <SignOutButton>
            <button
              type="button"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--hall-muted-2)",
                fontWeight: 700,
              }}
            >
              Sign out →
            </button>
          </SignOutButton>
        </div>
      </div>

      {/* ── Page title block ───────────────────────────────────────────────── */}
      <header
        className="px-9 py-12"
        style={{
          borderBottom: "1px solid var(--hall-line-soft, rgba(0,0,0,0.08))",
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div
            className="mb-3"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--hall-muted-2)",
            }}
          >
            · YOUR PROJECT SPACE
          </div>
          <h1
            className="leading-[1.02] tracking-[-0.025em]"
            style={{
              fontFamily:
                "var(--font-hall-display, 'Instrument Serif', serif)",
              fontSize: "clamp(36px, 5.5vw, 64px)",
              fontWeight: 400,
              color: "var(--hall-ink-0)",
            }}
          >
            {projectName}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {stage && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  border: "1px solid var(--hall-ink-0)",
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-ink-0)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--hall-lime, #c6f24a)" }}
                />
                {stage}
              </span>
            )}
            {project.geography && (
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 11,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.04em",
                }}
              >
                {project.geography}
              </span>
            )}
            {topicNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topicNames.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      background: "var(--hall-fill-soft, rgba(0,0,0,0.04))",
                      color: "var(--hall-ink-3, #2a2a2a)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Welcome card ────────────────────────────────────────────────────── */}
      {project.hall_welcome_note && (
        <section
          className="px-9 py-12"
          style={{
            borderBottom: "1px solid var(--hall-line-soft, rgba(0,0,0,0.08))",
          }}
        >
          <div className="max-w-5xl mx-auto">
            <p
              className="mb-3"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--hall-muted-2)",
              }}
            >
              · WELCOME
            </p>
            <p
              className="text-[18px] md:text-[20px] leading-[1.55] max-w-[680px] whitespace-pre-line"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {project.hall_welcome_note}
            </p>
          </div>
        </section>
      )}

      {/* ── HallComposedHero: quote + angles + signature + listening + proposal + timeline ── */}
      {hero && <HallComposedHero hero={hero} projectName={projectName} />}

      {/* ── Where we are + What we heard (prose synthesis) ─────────────────── */}
      {(project.hall_current_focus ||
        project.hall_next_milestone ||
        anyHeard) && (
        <section
          className="px-9 py-12"
          style={{
            borderBottom: "1px solid var(--hall-line-soft, rgba(0,0,0,0.08))",
          }}
        >
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Left column: where we are now */}
            {(project.hall_current_focus || project.hall_next_milestone) && (
              <div>
                <p
                  className="mb-4"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  · WHERE WE ARE
                </p>
                <Field
                  label="Current focus"
                  value={project.hall_current_focus}
                />
                <Field
                  label="Next milestone"
                  value={project.hall_next_milestone}
                />
              </div>
            )}
            {/* Right column: what we heard */}
            {anyHeard && (
              <div>
                <p
                  className="mb-4"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  · WHAT WE HEARD
                </p>
                <Field label="The challenge" value={project.hall_challenge} />
                <Field
                  label="What matters most"
                  value={project.hall_matters_most}
                />
                <Field
                  label="What may be in the way"
                  value={project.hall_obstacles}
                />
                <Field
                  label="What success could look like"
                  value={project.hall_success}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Empty state when no Hall fields populated yet ──────────────────── */}
      {!project.hall_welcome_note &&
        !hero &&
        !project.hall_current_focus &&
        !project.hall_next_milestone &&
        !anyHeard && (
          <section className="px-9 py-16">
            <div className="max-w-5xl mx-auto">
              <div
                className="px-8 py-12 text-center"
                style={{
                  border:
                    "1px dashed var(--hall-line, rgba(0,0,0,0.15))",
                  background: "var(--hall-paper-0, #fff)",
                }}
              >
                <p
                  className="mb-3"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  Your Hall is being prepared
                </p>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--hall-muted-3)" }}
                >
                  Your Common House contact is putting together the first
                  view. Check back shortly.
                </p>
              </div>
            </div>
          </section>
        )}

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      <section className="px-9 py-12">
        <div className="max-w-5xl mx-auto">
          <p
            className="mb-3"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--hall-muted-2)",
            }}
          >
            · CONTACT
          </p>
          <p
            className="text-[15px] leading-relaxed"
            style={{ color: "var(--hall-ink-3)" }}
          >
            Questions or anything you&apos;d like to add?{" "}
            <a
              href="mailto:josemanuel@wearecommonhouse.com"
              className="underline hover:opacity-70"
              style={{ color: "var(--hall-ink-0)" }}
            >
              josemanuel@wearecommonhouse.com
            </a>
          </p>
        </div>
      </section>

      <footer
        className="px-9 py-8"
        style={{
          borderTop: "1px solid var(--hall-line-soft, rgba(0,0,0,0.08))",
        }}
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--hall-muted-3)",
            }}
          >
            Prepared by Common House
          </p>
          <p
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--hall-muted-3)",
            }}
          >
            <a href="/trust" className="hover:underline">
              Trust
            </a>{" "}
            ·{" "}
            <a href="/status" className="hover:underline">
              Status
            </a>{" "}
            ·{" "}
            <a href="/security" className="hover:underline">
              Security
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

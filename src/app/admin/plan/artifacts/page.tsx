import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getEligibleObjectivesForV1,
  getObjectiveArtifacts,
  type ArtifactStatus,
} from "@/lib/plan";
import { PlanNav } from "@/components/plan/PlanNav";
import { ArtifactRow } from "@/components/plan/ArtifactRow";
import { CreateDraftPanel } from "@/components/plan/CreateDraftPanel";

export const dynamic = "force-dynamic";

export default async function PlanArtifactsPage() {
  await requireAdmin();

  const [artifacts, eligibleObjectives] = await Promise.all([
    getObjectiveArtifacts(),
    getEligibleObjectivesForV1(),
  ]);

  const counts: Record<ArtifactStatus, number> = {
    draft: 0,
    in_review: 0,
    approved: 0,
    sent: 0,
    archived: 0,
  };
  let totalOpenQuestions = 0;
  let totalAnsweredQuestions = 0;
  for (const a of artifacts) {
    counts[a.status] += 1;
    totalOpenQuestions += a.open_questions_count;
    totalAnsweredQuestions += a.answered_questions_count;
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PLAN · <b style={{ color: "var(--hall-ink-0)" }}>ARTIFACTS</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Plan{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Artifacts
              </em>
              .
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            <span>DRAFT {counts.draft}</span>
            <span>REVIEW {counts.in_review}</span>
            <span>APPROVED {counts.approved}</span>
            <span>SENT {counts.sent}</span>
            {totalOpenQuestions > 0 && (
              <span style={{ color: "var(--hall-danger)" }}>◯ {totalOpenQuestions} OPEN</span>
            )}
            {totalAnsweredQuestions > 0 && (
              <span style={{ color: "var(--hall-ok)" }}>● {totalAnsweredQuestions} ANSWERED</span>
            )}
          </div>
        </header>

        <div
          className="px-9 pt-3"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <PlanNav active="artifacts" />
        </div>

        <div className="px-9 py-6">
          <p
            className="text-[12px] leading-relaxed max-w-2xl mb-6"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Drafts producidos por{" "}
            <code style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}>
              plan-master-agent
            </code>{" "}
            para mover KPIs del plan. Cada artifact tiene preguntas abiertas que respondes iterativamente —
            el agente regenera el doc cuando acumulas respuestas. Expandí cualquier fila para ver las preguntas.
          </p>

          <CreateDraftPanel objectives={eligibleObjectives} />

          {artifacts.length === 0 ? (
            <div
              className="px-6 py-12 text-center"
              style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
            >
              <p
                className="text-[14px] font-semibold mb-2"
                style={{ color: "var(--hall-ink-0)" }}
              >
                No artifacts yet
              </p>
              <p
                className="text-[12px] max-w-md mx-auto"
                style={{ color: "var(--hall-muted-2)" }}
              >
                Cuando{" "}
                <code style={{ fontFamily: "var(--font-hall-mono)" }}>plan-master-agent</code>{" "}
                corra en modo execute y produzca un draft, aparecerá acá con su link de Drive y
                el bloque de calendario.
              </p>
            </div>
          ) : (
            <div>
              <div
                className="grid grid-cols-[1.6fr_1.4fr_0.7fr_0.9fr_0.9fr_0.9fr_0.4fr] gap-4 px-2 py-2"
                style={{
                  borderBottom: "1px solid var(--hall-ink-0)",
                  fontFamily: "var(--font-hall-mono)",
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Objective
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Artifact / Questions
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Created
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Status
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Drive
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Calendar
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em] text-right"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  Expand
                </span>
              </div>
              <ul className="flex flex-col">
                {artifacts.map((a) => (
                  <li
                    key={a.id}
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <ArtifactRow artifact={a} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getObjectivesForYear,
  getRevenueEventsForYear,
  summarizeRevenue,
  currentQuarter,
} from "@/lib/plan";
import PlanView from "@/components/plan/PlanView";
import { PlanNav } from "@/components/plan/PlanNav";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  await requireAdmin();

  const [objectives2026, objectives2027, revenueEvents2026] = await Promise.all([
    getObjectivesForYear(2026),
    getObjectivesForYear(2027),
    getRevenueEventsForYear(2026),
  ]);

  const revenue2026 = summarizeRevenue(objectives2026, revenueEvents2026);
  const { quarter } = currentQuarter();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-3 sm:gap-6 px-4 sm:px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PLAN · <b style={{ color: "var(--hall-ink-0)" }}>Q{quarter ?? 2} 2026</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Plan
              </em>
              .
            </h1>
          </div>
          <button
            disabled
            className="text-[11px] px-3 py-1.5 cursor-not-allowed"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-3)",
              border: "1px solid var(--hall-line-strong)",
              borderRadius: 3,
              background: "var(--hall-paper-0)",
            }}
            title="Próximo sprint"
          >
            ▲ QUARTER CLOSE
          </button>
        </header>

        <div
          className="px-4 sm:px-9 pt-3"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <PlanNav active="objectives" />
        </div>

        <div className="px-4 sm:px-9 py-5 sm:py-6">
          <p
            className="text-[12px] leading-relaxed max-w-2xl mb-6"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Plan estratégico 2026 → Q1 2027. El sistema usa estos objetivos para filtrar señales
            y priorizar el weekly synthesis. Editá un objetivo, cambiá su tier, y toda la capa
            de agentes recalibra en la próxima corrida.
          </p>
          <PlanView
            objectives2026={objectives2026}
            objectives2027={objectives2027}
            revenue2026={revenue2026}
            currentQuarter={quarter ?? 2}
          />
        </div>
      </main>
    </div>
  );
}

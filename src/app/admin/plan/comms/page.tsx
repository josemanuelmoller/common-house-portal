import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getActivePillars,
  getActiveAudiences,
  getActiveChannels,
  getPitchesForWindow,
  getOutcomesForPitches,
} from "@/lib/comms-strategy";
import CommsView from "@/components/plan/CommsView";
import { PlanNav } from "@/components/plan/PlanNav";

export const dynamic = "force-dynamic";

export default async function PlanCommsPage() {
  await requireAdmin();

  const [pillars, audiences, channels, pitches] = await Promise.all([
    getActivePillars(),
    getActiveAudiences(),
    getActiveChannels(),
    getPitchesForWindow(), // default: today → +30d
  ]);

  // Outcomes keyed by pitch_id — only fetch for pitches in terminal "post-publish"
  // states where metrics would be meaningful.
  const outcomeEligibleIds = pitches
    .filter(p => p.status === "drafted" || p.status === "published")
    .map(p => p.id);
  const outcomesMap = await getOutcomesForPitches(outcomeEligibleIds);
  const outcomes = Object.fromEntries(outcomesMap);

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
              PLAN · <b style={{ color: "var(--hall-ink-0)" }}>COMMS</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Comms{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                strategy
              </em>
              .
            </h1>
          </div>
        </header>

        <div
          className="px-9 pt-3"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <PlanNav active="comms" />
        </div>

        <div className="px-9 py-6">
          <p
            className="text-[12px] leading-relaxed max-w-2xl mb-6"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Estrategia de comunicación. Pilares, audiencias y canales definen qué contenido
            propone el sistema. El agente{" "}
            <code style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}>
              propose-content-pitches
            </code>{" "}
            corre el último viernes de cada mes.
          </p>
          <CommsView
            pillars={pillars}
            audiences={audiences}
            channels={channels}
            pitches={pitches}
            outcomes={outcomes}
          />
        </div>
      </main>
    </div>
  );
}

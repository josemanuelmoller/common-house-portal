import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AgentHealthActions, DiagnoseButton } from "./actions-client";

export const dynamic = "force-dynamic";

type Diagnosis = {
  cluster_key: string;
  routine_name: string;
  error_pattern: string;
  sample_error: string | null;
  classification: string;
  confidence: string;
  root_cause_hypothesis: string | null;
  suggested_fix: string | null;
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
  status: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
};

async function loadDiagnoses(): Promise<Diagnosis[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("agent_health_diagnoses")
    .select("*")
    .order("status", { ascending: true }) // new → acknowledged → resolved → silenced
    .order("last_seen", { ascending: false })
    .limit(200);
  return (data ?? []) as Diagnosis[];
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "hace un momento";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `hace ${diffDays}d`;
}

function classColor(cls: string): string {
  switch (cls) {
    case "schema_drift":
    case "env_missing":
    case "auth_failure":
      return "var(--hall-danger)";
    case "notion_404":
    case "timeout":
    case "rate_limit":
      return "var(--hall-warn)";
    case "network":
      return "var(--hall-muted-2)";
    default:
      return "var(--hall-muted-3)";
  }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    new:          { bg: "var(--hall-danger-soft)", fg: "var(--hall-danger)", label: "NEW" },
    acknowledged: { bg: "var(--hall-warn-soft)",   fg: "var(--hall-warn)",   label: "ACK" },
    resolved:     { bg: "var(--hall-ok-soft)",     fg: "var(--hall-ok)",     label: "RESOLVED" },
    silenced:     { bg: "var(--hall-fill-soft)",   fg: "var(--hall-muted-3)", label: "SILENCED" },
  };
  const s = map[status] ?? map.new;
  return (
    <span
      className="px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: s.fg,
        background: s.bg,
      }}
    >
      {s.label}
    </span>
  );
}

export default async function AgentHealthPage() {
  await requireAdmin();
  const rows = await loadDiagnoses();

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    ack: rows.filter((r) => r.status === "acknowledged").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    silenced: rows.filter((r) => r.status === "silenced").length,
  };

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-60 flex flex-col"
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
              CONTROL ROOM · AGENT HEALTH ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Agent Health · Diagnoses
            </h1>
          </div>
          <DiagnoseButton />
        </header>

        <div className="flex-1 px-9 py-7">
          <div className="max-w-5xl">
            {/* Summary metrics */}
            <div className="grid grid-cols-4 gap-3 mb-7">
              {[
                { label: "New", value: counts.new, color: "var(--hall-danger)" },
                { label: "Acknowledged", value: counts.ack, color: "var(--hall-warn)" },
                { label: "Resolved", value: counts.resolved, color: "var(--hall-ok)" },
                { label: "Silenced", value: counts.silenced, color: "var(--hall-muted-3)" },
              ].map((m) => (
                <div key={m.label} className="p-4" style={{ border: "1px solid var(--hall-line)" }}>
                  <p
                    className="mb-1.5"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    {m.label}
                  </p>
                  <p
                    className="text-[1.8rem] font-[900] leading-none tracking-tight"
                    style={{ color: m.color }}
                  >
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            <HallSection
              title="Error"
              flourish="clusters"
              meta={`${rows.length} DIAGNOSES · DIAGNOSTIC-ONLY · NO AUTO-FIX`}
            >
              {rows.length === 0 ? (
                <p
                  className="py-10 text-center"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 11,
                    color: "var(--hall-muted-3)",
                  }}
                >
                  Sin diagnósticos aún. Corre el monitor con el botón Diagnose now ↗.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {rows.map((r) => (
                    <li
                      key={r.cluster_key}
                      className="p-4"
                      style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-1)" }}
                    >
                      {/* Top row: routine + status + classification */}
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--hall-ink-0)",
                            }}
                          >
                            {r.routine_name}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: classColor(r.classification),
                              border: `1px solid ${classColor(r.classification)}`,
                            }}
                          >
                            {r.classification.toUpperCase()}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 10,
                              color: "var(--hall-muted-3)",
                            }}
                          >
                            conf: {r.confidence}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 10,
                              color: "var(--hall-muted-2)",
                            }}
                          >
                            {r.occurrence_count}× · last {relativeTime(r.last_seen)}
                          </span>
                          <StatusPill status={r.status} />
                        </div>
                      </div>

                      {/* Hypothesis */}
                      {r.root_cause_hypothesis && (
                        <p
                          className="mb-2 leading-snug"
                          style={{ fontSize: 12, color: "var(--hall-ink-0)" }}
                        >
                          {r.root_cause_hypothesis}
                        </p>
                      )}

                      {/* Suggested fix */}
                      {r.suggested_fix && (
                        <pre
                          className="p-2 mb-2 whitespace-pre-wrap"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10.5,
                            color: "var(--hall-muted-2)",
                            background: "var(--hall-fill-soft)",
                            border: "1px solid var(--hall-line-soft)",
                          }}
                        >
                          {r.suggested_fix}
                        </pre>
                      )}

                      {/* Raw sample — collapsed by default with details */}
                      <details className="mb-2">
                        <summary
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10,
                            color: "var(--hall-muted-3)",
                            cursor: "pointer",
                          }}
                        >
                          Sample error ↓
                        </summary>
                        <pre
                          className="p-2 mt-1 whitespace-pre-wrap"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10,
                            color: "var(--hall-muted-3)",
                            background: "var(--hall-paper-0)",
                            border: "1px solid var(--hall-line-soft)",
                          }}
                        >
                          {r.sample_error ?? "(empty)"}
                        </pre>
                      </details>

                      {/* Actions */}
                      <AgentHealthActions clusterKey={r.cluster_key} currentStatus={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </HallSection>

            <p
              className="mt-4"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                color: "var(--hall-muted-3)",
              }}
            >
              Source: agent_health_diagnoses (Supabase commonhouse) · Runs via /api/diagnose-agent-errors · Diagnostic only — no code changes or restarts.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * /admin/routines — Routine health dashboard
 *
 * Joins the static ROUTINE_CATALOG (schedule, reads/writes, output surface,
 * visibility) with dynamic routine_runs telemetry (last run, duration,
 * success/failure, records read/written, error message). Read-only.
 *
 * Freshness heuristic: stale = no run in 1.5 × the routine's daily window
 * (compact rule — daily routines → 36h, bi-weekly → 14d). Routines that have
 * never run show as "never observed".
 */

import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ROUTINE_CATALOG, type RoutineCatalogEntry } from "@/lib/routine-log";

export const dynamic = "force-dynamic";

type LatestRun = {
  routine_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: "success" | "error";
  http_status: number | null;
  records_read: number | null;
  records_written: number | null;
  error_message: string | null;
};

type Row = {
  name: string;
  catalog: RoutineCatalogEntry;
  run: LatestRun | null;
  freshness: "fresh" | "stale" | "never";
  staleReason: string | null;
};

function expectedCadenceHours(entry: RoutineCatalogEntry): number {
  const s = entry.schedule.toLowerCase();
  if (s.includes("mon & thu")) return 96;
  if (s.includes("wed") && !s.includes("mon-fri")) return 7 * 24;
  if (s.includes("tue-sat")) return 36;
  if (s.includes("mon-fri")) return 36;
  return 7 * 24;
}

function classifyFreshness(
  run: LatestRun | null,
  entry: RoutineCatalogEntry
): { freshness: Row["freshness"]; staleReason: string | null } {
  if (!run) return { freshness: "never", staleReason: "never observed" };
  const hoursSinceRun =
    (Date.now() - new Date(run.started_at).getTime()) / 3_600_000;
  const threshold = expectedCadenceHours(entry);
  if (hoursSinceRun > threshold) {
    return {
      freshness: "stale",
      staleReason: `${Math.floor(hoursSinceRun)}h since last run (expected ≤ ${threshold}h)`,
    };
  }
  return { freshness: "fresh", staleReason: null };
}

async function fetchLatestRuns(): Promise<Map<string, LatestRun>> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("routine_latest_runs")
      .select(
        "routine_name, started_at, finished_at, duration_ms, status, http_status, records_read, records_written, error_message"
      );
    if (error) {
      console.error("[admin/routines] fetch error:", error.message);
      return new Map();
    }
    return new Map((data ?? []).map((r) => [r.routine_name as string, r as LatestRun]));
  } catch (err) {
    console.error("[admin/routines] supabase unavailable:", err);
    return new Map();
  }
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function statusStyle(status: "success" | "error" | "never"): { bg: string; color: string } {
  if (status === "success") return { bg: "var(--hall-ok-soft)",     color: "var(--hall-ok)" };
  if (status === "error")   return { bg: "var(--hall-danger-soft)", color: "var(--hall-danger)" };
  return                    { bg: "var(--hall-fill-soft)",          color: "var(--hall-muted-2)" };
}

function freshnessStyle(f: Row["freshness"]): { bg: string; color: string; label: string } {
  if (f === "fresh") return { bg: "var(--hall-ok-soft)",     color: "var(--hall-ok)",     label: "fresh" };
  if (f === "stale") return { bg: "var(--hall-warn-soft)",   color: "var(--hall-warn)",   label: "stale" };
  return             { bg: "var(--hall-fill-soft)",          color: "var(--hall-muted-2)", label: "never" };
}

export default async function RoutinesPage() {
  await requireAdmin();
  const latestRuns = await fetchLatestRuns();

  const rows: Row[] = Object.entries(ROUTINE_CATALOG).map(([name, catalog]) => {
    const run = latestRuns.get(name) ?? null;
    const { freshness, staleReason } = classifyFreshness(run, catalog);
    return { name, catalog, run, freshness, staleReason };
  });

  const order = { error: 0, stale: 1, never: 2, fresh: 3 } as const;
  rows.sort((a, b) => {
    const ka = a.run?.status === "error" ? 0 : order[a.freshness];
    const kb = b.run?.status === "error" ? 0 : order[b.freshness];
    if (ka !== kb) return ka - kb;
    return a.catalog.priority - b.catalog.priority;
  });

  const counts = {
    total: rows.length,
    fresh: rows.filter((r) => r.freshness === "fresh" && r.run?.status === "success").length,
    failing: rows.filter((r) => r.run?.status === "error").length,
    stale: rows.filter((r) => r.freshness === "stale").length,
    never: rows.filter((r) => r.freshness === "never").length,
  };

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 overflow-x-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              ROUTINES · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Routine <em className="hall-flourish">runs</em>
            </h1>
          </div>
          <span
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
          >
            FETCHED {new Date().toLocaleString("en-GB")}
          </span>
        </header>

        <div className="px-9 py-6 space-y-7">

          <p className="text-sm max-w-3xl" style={{color: "var(--hall-muted-2)"}}>
            Health of scheduled / cron routines. Joined from{" "}
            <code
              className="text-[11px] px-1"
              style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)", borderRadius: 3 }}
            >
              public.routine_runs
            </code>{" "}
            + static catalog in{" "}
            <code
              className="text-[11px] px-1"
              style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)", borderRadius: 3 }}
            >
              src/lib/routine-log.ts
            </code>.
          </p>

          <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-3xl">
            <StatPill label="Total"    value={counts.total}   />
            <StatPill label="Fresh"    value={counts.fresh}   tone="good" />
            <StatPill label="Failing"  value={counts.failing} tone={counts.failing > 0 ? "bad" : "neutral"} />
            <StatPill label="Stale"    value={counts.stale}   tone={counts.stale > 0 ? "warn" : "neutral"} />
            <StatPill label="No data"  value={counts.never}   tone={counts.never > 0 ? "warn" : "neutral"} />
          </section>

          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{borderBottom: "1px solid var(--hall-ink-0)"}}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
              >
                All <em className="hall-flourish">routines</em>
              </h2>
              <span
                style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
              >
                {rows.length} ROUTINES
              </span>
            </div>

            <div style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, overflow: "hidden" }}>
              <table className="w-full text-sm">
                <thead
                  className="text-[11px] uppercase tracking-wider"
                  style={{
                    background: "var(--hall-ink-0)",
                    color: "var(--hall-paper-0)",
                    fontFamily: "var(--font-hall-mono)",
                  }}
                >
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Routine</th>
                    <th className="text-left px-4 py-3 font-semibold">Schedule</th>
                    <th className="text-left px-4 py-3 font-semibold">Last run</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Dur</th>
                    <th className="text-right px-4 py-3 font-semibold">R / W</th>
                    <th className="text-left px-4 py-3 font-semibold">Fresh</th>
                    <th className="text-left px-4 py-3 font-semibold">Output surface</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const runStatus: "success" | "error" | "never" =
                      !r.run ? "never" : r.run.status;
                    const sStyle = statusStyle(runStatus);
                    const fresh = freshnessStyle(r.freshness);
                    return (
                      <tr
                        key={r.name}
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold" style={{color: "var(--hall-ink-0)"}}>{r.name}</div>
                          <div
                            className="text-[11px] mt-0.5"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                          >
                            {r.catalog.reads} → {r.catalog.writes}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-xs"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-3)" }}
                        >
                          {r.catalog.schedule}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r.run ? (
                            <>
                              <div style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-3)" }}>{relTime(r.run.started_at)}</div>
                              <div className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}>
                                {new Date(r.run.started_at).toISOString().slice(0, 16).replace("T", " ")}
                              </div>
                            </>
                          ) : (
                            <span style={{color: "var(--hall-muted-3)"}}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              letterSpacing: "0.06em",
                              background: sStyle.bg,
                              color: sStyle.color,
                            }}
                          >
                            {runStatus === "never" ? "no data" : runStatus}
                          </span>
                          {r.run?.error_message && (
                            <div
                              className="text-[10px] mt-1 max-w-[260px] truncate"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                              title={r.run.error_message}
                            >
                              {r.run.error_message}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs tabular-nums"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-3)" }}
                        >
                          {formatDuration(r.run?.duration_ms ?? null)}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs tabular-nums"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-3)" }}
                        >
                          {r.run?.records_read ?? "—"} / {r.run?.records_written ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              letterSpacing: "0.06em",
                              background: fresh.bg,
                              color: fresh.color,
                            }}
                          >
                            {fresh.label}
                          </span>
                          {r.staleReason && (
                            <div
                              className="text-[10px] mt-0.5"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                            >
                              {r.staleReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div style={{color: r.catalog.visible_in_product ? "var(--hall-ink-3)" : "var(--hall-warn)"}}>
                            {r.catalog.output_surface}
                          </div>
                          {!r.catalog.visible_in_product && (
                            <div
                              className="text-[10px] mt-0.5"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                            >
                              no UI consumer
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] mt-4 max-w-3xl" style={{color: "var(--hall-muted-3)"}}>
              A routine must be wrapped with{" "}
              <code
                className="text-[11px] px-1"
                style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)", borderRadius: 3 }}
              >
                withRoutineLog()
              </code>{" "}
              in{" "}
              <code
                className="text-[11px] px-1"
                style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)", borderRadius: 3 }}
              >
                src/lib/routine-log.ts
              </code>{" "}
              to show dynamic run data here. Routines declared in the catalog but not yet wrapped render as{" "}
              <em>no data</em>. Expected cadence is inferred from the schedule string; stale = no run within 1.5× the schedule window.
            </p>
          </section>

          <div>
            <Link
              href="/admin"
              className="hall-btn-ghost"
              style={{padding: 0}}
            >
              ← back to admin
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatPill({
  label, value, tone = "neutral",
}: { label: string; value: number; tone?: "good" | "bad" | "warn" | "neutral" }) {
  const { bg, fg, border } =
    tone === "good" ? { bg: "var(--hall-ok-soft)",     fg: "var(--hall-ok)",     border: "var(--hall-ok-soft)" } :
    tone === "bad"  ? { bg: "var(--hall-danger-soft)", fg: "var(--hall-danger)", border: "var(--hall-danger-soft)" } :
    tone === "warn" ? { bg: "var(--hall-warn-soft)",   fg: "var(--hall-warn)",   border: "var(--hall-warn-soft)" } :
                      { bg: "var(--hall-paper-0)",     fg: "var(--hall-ink-3)",  border: "var(--hall-line-soft)" };
  return (
    <div
      className="px-3 py-2"
      style={{ border: `1px solid ${border}`, background: bg, color: fg, borderRadius: 3 }}
    >
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ fontFamily: "var(--font-hall-mono)", opacity: 0.7 }}
      >
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

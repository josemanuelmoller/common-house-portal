/**
 * /admin/ops-mirror
 * Internal read-path test: Opportunities served from Supabase only.
 *
 * Access: admin-gated (requireAdmin — same as all /admin/* pages).
 * Data:   server-side Supabase read via getSupabaseServerClient().
 *         No client-side fetch. Anon key never sent to browser.
 * Writes: none. This page is read-only.
 * Hall:   untouched. This route is isolated from all client-facing surfaces.
 */

import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  fetchOpportunitiesFromSupabase,
  OpportunityRow,
} from "@/lib/supabase-server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | null | undefined): string {
  return val?.trim() || "—";
}

function fmtCurrency(val: number | null): string {
  if (val === null || val === undefined) return "—";
  if (val === 0) return "£0";
  if (val >= 1_000_000) return `£${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `£${(val / 1_000).toFixed(0)}K`;
  return `£${val}`;
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  return val.slice(0, 10); // YYYY-MM-DD
}

// ── Pill components ───────────────────────────────────────────────────────────

const PILL_BASE = {
  fontFamily: "var(--font-hall-mono)",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
};

function StatusPill({ s }: { s: string | null }) {
  const v = s ?? "—";
  const styles: Record<string, { bg: string; color: string }> = {
    "Active":      { bg: "var(--hall-ok-soft)",     color: "var(--hall-ok)" },
    "Qualifying":  { bg: "var(--hall-info-soft)",   color: "var(--hall-info)" },
    "New":         { bg: "var(--hall-fill-soft)",   color: "var(--hall-ink-3)" },
    "Stalled":     { bg: "var(--hall-fill-soft)",   color: "var(--hall-muted-3)" },
    "Closed Lost": { bg: "var(--hall-danger-soft)", color: "var(--hall-danger)" },
    "Won":         { bg: "var(--hall-ok-soft)",     color: "var(--hall-ok)" },
  };
  const style = styles[v] ?? { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" };
  return (
    <span className="px-2 py-0.5 rounded-full whitespace-nowrap" style={{ ...PILL_BASE, fontSize: 9, ...style }}>
      {v}
    </span>
  );
}

function PriorityPill({ p }: { p: string | null }) {
  if (!p) return <span style={{ color: "var(--hall-muted-3)", fontSize: 9 }}>—</span>;
  const style = p.startsWith("P1")
    ? { color: "var(--hall-danger)", bg: "var(--hall-danger-soft)" }
    : p.startsWith("P2")
    ? { color: "var(--hall-warn)", bg: "var(--hall-warn-soft)" }
    : p.startsWith("P3")
    ? { color: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" }
    : { color: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" };
  return (
    <span
      className="px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ ...PILL_BASE, fontSize: 9, background: style.bg, color: style.color }}
    >
      {p.slice(0, 2)}
    </span>
  );
}

function ScopePill({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: "var(--hall-muted-3)", fontSize: 9 }}>—</span>;
  return (
    <span
      className="px-1.5 py-0.5 rounded"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 9,
        fontWeight: 700,
        background: "var(--hall-fill-soft)",
        color: "var(--hall-muted-2)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {s}
    </span>
  );
}

function QualPill({ q }: { q: string | null }) {
  const v = q ?? "—";
  const styles: Record<string, { bg: string; color: string }> = {
    "Qualified":       { bg: "var(--hall-ok-soft)",     color: "var(--hall-ok)" },
    "Needs Review":    { bg: "var(--hall-warn-soft)",   color: "var(--hall-warn)" },
    "Below Threshold": { bg: "var(--hall-danger-soft)", color: "var(--hall-danger)" },
    "Not Scored":      { bg: "var(--hall-fill-soft)",   color: "var(--hall-muted-3)" },
  };
  const style = styles[v] ?? { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" };
  return (
    <span className="px-2 py-0.5 rounded-full whitespace-nowrap" style={{ ...PILL_BASE, fontSize: 9, ...style }}>
      {v}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function OppRow({ row }: { row: OpportunityRow }) {
  return (
    <tr className="transition-colors group" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      {/* Title + org */}
      <td className="px-4 py-3 max-w-[240px]">
        <p className="text-[11.5px] font-bold leading-snug line-clamp-2" style={{ color: "var(--hall-ink-0)" }}>
          {fmt(row.title)}
        </p>
        {row.org_name && (
          <p className="mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9, color: "var(--hall-muted-2)" }}>
            {row.org_name}
          </p>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StatusPill s={row.status} />
      </td>

      {/* Type */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
          {fmt(row.opportunity_type)}
        </span>
      </td>

      {/* Scope */}
      <td className="px-3 py-3">
        <ScopePill s={row.scope} />
      </td>

      {/* Qualification */}
      <td className="px-3 py-3 whitespace-nowrap">
        <QualPill q={row.qualification_status} />
      </td>

      {/* Priority */}
      <td className="px-3 py-3">
        <PriorityPill p={row.priority} />
      </td>

      {/* Trigger signal */}
      <td className="px-3 py-3 max-w-[200px]">
        <p className="leading-snug line-clamp-3" style={{ fontSize: 10, color: "var(--hall-muted-2)" }}>
          {fmt(row.trigger_signal)}
        </p>
      </td>

      {/* Suggested next step */}
      <td className="px-3 py-3 max-w-[200px]">
        <p className="leading-snug line-clamp-3" style={{ fontSize: 10, color: "var(--hall-muted-2)" }}>
          {fmt(row.suggested_next_step)}
        </p>
      </td>

      {/* Value */}
      <td className="px-3 py-3 whitespace-nowrap text-right">
        <span
          className="tabular-nums"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, fontWeight: 700, color: "var(--hall-ink-3)" }}
        >
          {fmtCurrency(row.value_estimate)}
        </span>
      </td>

      {/* Close date */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span
          className="tabular-nums"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}
        >
          {fmtDate(row.expected_close_date)}
        </span>
      </td>
    </tr>
  );
}

// ── Summary counts ────────────────────────────────────────────────────────────

function counts(rows: OpportunityRow[]) {
  return {
    total:    rows.length,
    active:   rows.filter(r => r.status === "Active").length,
    p1:       rows.filter(r => r.priority?.startsWith("P1")).length,
    withDate: rows.filter(r => r.expected_close_date).length,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OpsMirrorPage() {
  await requireAdmin();

  const { rows, error } = await fetchOpportunitiesFromSupabase();
  const c = counts(rows);

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 thin header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              INTERNAL · SUPABASE READ TEST ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Ops{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--hall-ink-0)",
                }}
              >
                mirror
              </em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}
          >
            <span>
              <b style={{ color: "var(--hall-ink-0)" }}>{c.total}</b> TOTAL
            </span>
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <span>
              <b style={{ color: c.active > 0 ? "var(--hall-ok)" : "var(--hall-muted-3)" }}>{c.active}</b> ACTIVE
            </span>
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <span>
              <b style={{ color: c.p1 > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)" }}>{c.p1}</b> P1
            </span>
          </div>
        </header>

        <div className="px-9 py-7 space-y-5">

          {/* Read-test banner */}
          <div
            className="flex items-center gap-3 px-5 py-3"
            style={{ background: "var(--hall-warn-paper)", border: "1px solid var(--hall-warn)" }}
          >
            <span className="text-base leading-none" style={{ color: "var(--hall-warn)" }}>⚡</span>
            <div>
              <p
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--hall-warn)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Supabase read test — internal only
              </p>
              <p className="mt-0.5" style={{ fontSize: 10, color: "var(--hall-ink-3)" }}>
                Data source: <code
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: "var(--hall-warn-soft)",
                    padding: "0 4px",
                    borderRadius: 2,
                  }}
                >opportunities</code> table in Supabase (rjcsasbaxihaubkkkxrt).
                Server-side fetch only. Anon key never sent to browser.
                Hall and client-facing surfaces are unaffected.
                Writes remain on Notion.
              </p>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div
              className="px-5 py-4"
              style={{ background: "var(--hall-danger-soft)", border: "1px solid var(--hall-danger)" }}
            >
              <p
                className="mb-1"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--hall-danger)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Supabase error
              </p>
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-danger)" }}>{error}</p>
            </div>
          )}

          {/* Table */}
          {!error && rows.length > 0 && (
            <div className="overflow-x-auto" style={{ border: "1px solid var(--hall-line)" }}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hall-line)", background: "var(--hall-fill-soft)" }}>
                    {[
                      "Title / Org",
                      "Status",
                      "Type",
                      "Scope",
                      "Qualification",
                      "Priority",
                      "Trigger signal",
                      "Suggested next step",
                      "Value",
                      "Close date",
                    ].map(h => (
                      <th
                        key={h}
                        className="px-3 py-2.5 whitespace-nowrap first:px-4"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--hall-muted-2)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <OppRow key={row.notion_id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!error && rows.length === 0 && (
            <div className="px-8 py-16 text-center" style={{ border: "1px solid var(--hall-line)" }}>
              <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No rows returned from Supabase.</p>
            </div>
          )}

          {/* Footer meta */}
          <p
            className="text-right"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-3)",
            }}
          >
            {c.total} rows · {c.withDate} with close date · Supabase project rjcsasbaxihaubkkkxrt
          </p>

        </div>
      </main>
    </div>
  );
}

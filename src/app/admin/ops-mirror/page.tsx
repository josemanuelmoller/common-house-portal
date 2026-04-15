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

function StatusPill({ s }: { s: string | null }) {
  const v = s ?? "—";
  const cls: Record<string, string> = {
    "Active":      "bg-[#B2FF59]/20 text-green-800",
    "Qualifying":  "bg-blue-50 text-blue-700",
    "New":         "bg-slate-100 text-slate-600",
    "Stalled":     "bg-[#EFEFEA] text-[#131218]/40",
    "Closed Lost": "bg-red-50 text-red-500",
    "Won":         "bg-[#B2FF59]/30 text-green-800",
  };
  return (
    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls[v] ?? "bg-[#EFEFEA] text-[#131218]/35"}`}>
      {v}
    </span>
  );
}

function PriorityPill({ p }: { p: string | null }) {
  if (!p) return <span className="text-[#131218]/20 text-[9px]">—</span>;
  const cls = p.startsWith("P1")
    ? "text-red-600 bg-red-50"
    : p.startsWith("P2")
    ? "text-amber-700 bg-amber-50"
    : p.startsWith("P3")
    ? "text-[#131218]/40 bg-[#EFEFEA]"
    : "text-[#131218]/30 bg-[#EFEFEA]";
  return (
    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {p.slice(0, 2)}
    </span>
  );
}

function ScopePill({ s }: { s: string | null }) {
  if (!s) return <span className="text-[#131218]/20 text-[9px]">—</span>;
  return (
    <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-[#131218]/6 text-[#131218]/45 uppercase tracking-wide">
      {s}
    </span>
  );
}

function QualPill({ q }: { q: string | null }) {
  const v = q ?? "—";
  const cls: Record<string, string> = {
    "Qualified":       "bg-[#B2FF59]/25 text-green-800",
    "Needs Review":    "bg-amber-50 text-amber-700",
    "Below Threshold": "bg-red-50 text-red-500",
    "Not Scored":      "bg-[#EFEFEA] text-[#131218]/30",
  };
  return (
    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls[v] ?? "bg-[#EFEFEA] text-[#131218]/30"}`}>
      {v}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function OppRow({ row }: { row: OpportunityRow }) {
  return (
    <tr className="border-b border-[#E0E0D8] hover:bg-[#FAFAF8] transition-colors group">
      {/* Title + org */}
      <td className="px-4 py-3 max-w-[240px]">
        <p className="text-[11.5px] font-bold text-[#131218] leading-snug line-clamp-2">
          {fmt(row.title)}
        </p>
        {row.org_name && (
          <p className="text-[9px] text-[#131218]/40 mt-0.5 font-medium">{row.org_name}</p>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StatusPill s={row.status} />
      </td>

      {/* Type */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-[9px] text-[#131218]/45 font-medium">{fmt(row.opportunity_type)}</span>
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
        <p className="text-[9.5px] text-[#131218]/55 leading-snug line-clamp-3">
          {fmt(row.trigger_signal)}
        </p>
      </td>

      {/* Suggested next step */}
      <td className="px-3 py-3 max-w-[200px]">
        <p className="text-[9.5px] text-[#131218]/55 leading-snug line-clamp-3">
          {fmt(row.suggested_next_step)}
        </p>
      </td>

      {/* Value */}
      <td className="px-3 py-3 whitespace-nowrap text-right">
        <span className="text-[10px] font-bold text-[#131218]/60 tabular-nums">
          {fmtCurrency(row.value_estimate)}
        </span>
      </td>

      {/* Close date */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-[9.5px] text-[#131218]/45 tabular-nums">{fmtDate(row.expected_close_date)}</span>
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

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Internal · Supabase Read Test
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Ops <em className="font-black italic text-[#c8f55a]">mirror.</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Opportunities read directly from Supabase — server-side only, no Notion call.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{c.total}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Total rows</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${c.active > 0 ? "text-[#c8f55a]" : "text-white/20"}`}>
                  {c.active}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Active</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${c.p1 > 0 ? "text-red-400" : "text-white/20"}`}>
                  {c.p1}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">P1 — Act Now</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-8 space-y-5">

          {/* Read-test banner */}
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <span className="text-amber-500 text-base leading-none">⚡</span>
            <div>
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Supabase read test — internal only
              </p>
              <p className="text-[9.5px] text-amber-700 mt-0.5">
                Data source: <code className="font-mono bg-amber-100 px-1 rounded">opportunities</code> table in Supabase (rjcsasbaxihaubkkkxrt).
                Server-side fetch only. Anon key never sent to browser.
                Hall and client-facing surfaces are unaffected.
                Writes remain on Notion.
              </p>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Supabase error</p>
              <p className="text-[10.5px] text-red-600 font-mono">{error}</p>
            </div>
          )}

          {/* Table */}
          {!error && rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E0E0D8] bg-[#FAFAF8]">
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
                        className="px-3 py-2.5 text-[8px] font-bold tracking-widest uppercase text-[#131218]/30 whitespace-nowrap first:px-4"
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
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-8 py-16 text-center">
              <p className="text-sm text-[#131218]/25">No rows returned from Supabase.</p>
            </div>
          )}

          {/* Footer meta */}
          <p className="text-[8.5px] text-[#131218]/20 font-medium text-right">
            {c.total} rows · {c.withDate} with close date · Supabase project rjcsasbaxihaubkkkxrt
          </p>

        </div>
      </main>
    </div>
  );
}

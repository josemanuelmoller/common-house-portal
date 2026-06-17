/**
 * HallRevenueCard — the CFO's hallway answer, in the Hall.
 *
 * Three lines: cobrado (with % of target), facturado en la calle (with %),
 * and the next invoice due. Reads revenue_events (fed nightly by the Xero
 * sync) + the quarter's revenue objective target.
 *
 * Currency: everything is normalised to USD (the Plan's target currency).
 * Daily ECB rates via frankfurter.app (cached 24h); hall_config key
 * `fx_usd_rates` is the offline fallback so a rate-API outage can never
 * blank the card. Mixed-currency sums in one number are management noise —
 * the tooltip keeps the original amounts honest.
 */

import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getHallConfig } from "@/lib/hall-config";
import { HallPipelineActions } from "@/components/HallPipelineActions";

type RevRow = {
  stage: string;
  amount: number | string | null;
  currency: string | null;
  due_date: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  notes: string | null;
  quarter: number | null;
};

type PipeRow = {
  id: string;
  title: string;
  org_name: string | null;
  status: string;
  value_estimate: number | string | null;
  expected_close_date: string | null;
  probability: string | null;
};

const CCY_SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };

function fmtOriginal(r: RevRow): string {
  const c = (r.currency ?? "USD").toUpperCase();
  const sym = CCY_SYMBOL[c] ?? `${c} `;
  const n = Number(r.amount ?? 0);
  return n >= 1_000 ? `${sym}${(n / 1_000).toFixed(1)}K` : `${sym}${Math.round(n)}`;
}

const STAGE_LABEL: Record<string, { label: string; color: string }> = {
  paid:     { label: "cobrada",   color: "var(--hall-ok)" },
  invoiced: { label: "facturada", color: "var(--hall-warn)" },
  sold:     { label: "vendida",   color: "var(--hall-muted-2)" },
};

const FALLBACK_RATES: Record<string, number> = { GBP: 1.34, EUR: 1.08, USD: 1 };

/** USD per 1 unit of `currency`. frankfurter returns USD→X; we invert. */
async function getUsdRates(): Promise<Record<string, number>> {
  const fallback = await getHallConfig<Record<string, number>>("fx_usd_rates", FALLBACK_RATES);
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { rates?: Record<string, number> };
    if (!j.rates) return fallback;
    const out: Record<string, number> = { USD: 1 };
    for (const [ccy, usdToX] of Object.entries(j.rates)) {
      if (usdToX > 0) out[ccy] = 1 / usdToX;
    }
    return { ...fallback, ...out };
  } catch {
    return fallback;
  }
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export async function HallRevenueCard() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;

  const sb = getSupabaseServerClient();
  const [ratesRes, eventsRes, targetRes, pipeRes] = await Promise.all([
    getUsdRates(),
    sb.from("revenue_events")
      .select("stage, amount, currency, due_date, invoice_date, invoice_number, notes, quarter")
      .eq("year", year)
      .is("superseded_at", null),
    sb.from("strategic_objectives")
      .select("target_value")
      .eq("objective_type", "revenue")
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle(),
    // Pipeline "Por cerrar": proposal out the door, or an active deal with a
    // real number attached. Everything else lives in /admin/opportunities.
    sb.from("opportunities")
      .select("id, title, org_name, status, value_estimate, expected_close_date, probability")
      .in("status", ["Proposal Sent", "Active"])
      .eq("is_legacy", false)
      .eq("is_archived", false)
      .order("expected_close_date", { ascending: true, nullsFirst: false }),
  ]);

  const pipeline = ((pipeRes.data ?? []) as PipeRow[]).filter(
    p => p.status === "Proposal Sent" || Number(p.value_estimate ?? 0) > 0
  );

  const rates = ratesRes;
  const yearRows = (eventsRes.data ?? []) as RevRow[];
  const rows = yearRows.filter(r => r.quarter === quarter);

  // Últimas facturas del año (cruzan trimestres a propósito — lo reciente es
  // lo reciente), en su moneda original para mantener el detalle auditable.
  const recentInvoices = [...yearRows]
    .filter(r => r.invoice_date)
    .sort((a, b) => (a.invoice_date! > b.invoice_date! ? -1 : 1))
    .slice(0, 3);
  const target = Number((targetRes.data as { target_value?: number | null } | null)?.target_value ?? 0);

  const toUsd = (r: RevRow) => Number(r.amount ?? 0) * (rates[(r.currency ?? "USD").toUpperCase()] ?? 1);
  const sum = (stage: string) => rows.filter(r => r.stage === stage).reduce((s, r) => s + toUsd(r), 0);

  const paidUsd = sum("paid");
  const invoicedUsd = sum("invoiced");
  const soldUsd = sum("sold");
  const pct = (n: number) => (target > 0 ? Math.round((n / target) * 100) : 0);
  // Cumplimiento total = todo lo comprometido contra la meta (paid+invoiced+sold)
  const totalUsd = paidUsd + invoicedUsd + soldUsd;

  // Next invoice due (open = invoiced, not yet paid)
  const nextDue = rows
    .filter(r => r.stage === "invoiced" && r.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0] ?? null;
  const openInvoices = rows.filter(r => r.stage === "invoiced").length;

  // Original per-currency amounts so the USD aggregate stays auditable.
  const byCurrency = new Map<string, number>();
  for (const r of rows) {
    const c = (r.currency ?? "USD").toUpperCase();
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + Number(r.amount ?? 0));
  }
  const originalsLabel = [...byCurrency.entries()]
    .map(([c, n]) => `${c} ${n.toLocaleString("en-US")}`)
    .join(" + ");

  if (rows.length === 0 && target === 0 && pipeline.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        Sin datos de revenue este trimestre — el sync de Xero corre cada madrugada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" title={originalsLabel ? `Montos originales: ${originalsLabel}` : undefined}>
      {/* Línea 1 — cumplimiento contra la meta */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[20px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>
          {pct(totalUsd)}%
        </span>
        <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
          de {fmtUsd(target)} · Q{quarter} {year}
        </span>
      </div>

      {/* Barra de progreso: pagado (sólido) + facturado (suave) */}
      <div className="h-[5px] rounded overflow-hidden flex" style={{ background: "var(--hall-fill-soft)" }}>
        <div style={{ width: `${Math.min(100, pct(paidUsd))}%`, background: "var(--hall-ink-0)" }} />
        <div style={{ width: `${Math.min(100 - Math.min(100, pct(paidUsd)), pct(invoicedUsd + soldUsd))}%`, background: "var(--hall-muted-3)" }} />
      </div>

      <p className="text-[11px]" style={{ color: "var(--hall-ink-2)" }}>
        <b>{fmtUsd(paidUsd)}</b> cobrado ({pct(paidUsd)}%) · <b>{fmtUsd(invoicedUsd)}</b> facturado ({pct(invoicedUsd)}%)
        {soldUsd > 0 && <> · {fmtUsd(soldUsd)} vendido</>}
      </p>

      {nextDue && (
        <p className="text-[10.5px]" style={{ color: "var(--hall-muted-2)" }}>
          {openInvoices} factura{openInvoices === 1 ? "" : "s"} abierta{openInvoices === 1 ? "" : "s"} — próxima vence{" "}
          <b style={{ color: "var(--hall-ink-2)" }}>{nextDue.due_date!.slice(5)}</b>
          {nextDue.notes ? ` (${nextDue.notes.replace(/^Xero · /, "")})` : ""}
        </p>
      )}

      {/* Últimas facturas — detalle rápido sin salir del Hall */}
      {recentInvoices.length > 0 && (
        <div className="mt-1.5 flex flex-col">
          <p
            className="uppercase tracking-[0.08em] font-bold mb-1"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 8.5, color: "var(--hall-muted-3)" }}
          >
            Últimas facturas
          </p>
          {recentInvoices.map((r, i) => {
            const stage = STAGE_LABEL[r.stage] ?? { label: r.stage, color: "var(--hall-muted-2)" };
            const who = (r.notes ?? "").replace(/^Xero · /, "") || "—";
            return (
              <div
                key={`${r.invoice_number}-${i}`}
                className="flex items-baseline gap-2 py-1"
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                <span
                  className="shrink-0"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9.5, color: "var(--hall-muted-2)" }}
                >
                  {r.invoice_number ?? "—"}
                </span>
                <span className="flex-1 min-w-0 truncate text-[10.5px]" style={{ color: "var(--hall-ink-2)" }}>
                  {who}
                </span>
                <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                  {fmtOriginal(r)}
                </span>
                <span
                  className="shrink-0 uppercase tracking-[0.06em] font-bold"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 8, color: stage.color }}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Por cerrar — propuestas enviadas y deals activos con monto. ✓ Ganada
          crea el revenue_event 'sold' (suma al % de arriba); ✗ Perdida lo
          saca del pipeline dejando el histórico. */}
      {pipeline.length > 0 && (
        <div className="mt-1.5 flex flex-col">
          <p
            className="uppercase tracking-[0.08em] font-bold mb-1"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 8.5, color: "var(--hall-muted-3)" }}
          >
            Por cerrar
          </p>
          {pipeline.map(p => {
            const isProposal = p.status === "Proposal Sent";
            const amount = Number(p.value_estimate ?? 0);
            const meta = p.expected_close_date
              ? `cierre ${p.expected_close_date.slice(5, 10)}`
              : isProposal
              ? "en espera"
              : "por proponer";
            return (
              <div
                key={p.id}
                className="flex items-baseline gap-2 py-1"
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                <span className="flex-1 min-w-0 truncate text-[10.5px]" style={{ color: "var(--hall-ink-2)" }}>
                  {p.org_name ?? p.title}
                  <span className="ml-1.5" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 8.5, color: "var(--hall-muted-3)" }}>
                    {meta}
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                  {amount > 0 ? fmtUsd(amount) : "—"}
                </span>
                <span
                  className="shrink-0 uppercase tracking-[0.06em] font-bold"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 8,
                    color: isProposal ? "var(--hall-warn)" : "var(--hall-muted-2)",
                  }}
                >
                  {isProposal ? "propuesta" : "activa"}
                </span>
                <HallPipelineActions id={p.id} title={p.org_name ?? p.title} amount={amount > 0 ? amount : null} />
              </div>
            );
          })}
        </div>
      )}

      <Link
        href="/admin/plan"
        className="text-[9px] font-bold uppercase tracking-widest mt-0.5 hover:underline"
        style={{ color: "var(--hall-muted-2)" }}
      >
        Ver The Plan →
      </Link>
    </div>
  );
}

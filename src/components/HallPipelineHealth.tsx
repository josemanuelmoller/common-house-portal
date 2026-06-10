/**
 * HallPipelineHealth — one honest line about whether the Hall's data
 * pipeline is actually flowing.
 *
 * Quiet by design: when everything runs on cadence it renders a single muted
 * "Pipeline OK" micro-line. When a source stalls or routines error, it turns
 * into a visible amber/red strip naming exactly what's broken — so a stalled
 * ingestor is a banner, not a surprise three days later.
 *
 * Server component; data from src/lib/pipeline-health.ts (never throws).
 */

import Link from "next/link";
import { getPipelineHealth } from "@/lib/pipeline-health";

function ago(hours: number | null): string {
  if (hours === null) return "nunca";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export async function HallPipelineHealth() {
  const h = await getPipelineHealth();

  if (h.healthy) {
    return (
      <p
        className="flex items-center gap-1.5"
        style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9.5, color: "var(--hall-muted-3)" }}
      >
        <span style={{ color: "var(--hall-ok)" }}>●</span>
        PIPELINE OK · {h.sources.length} FUENTES ACTIVAS
      </p>
    );
  }

  const stalledLabel = h.stalled
    .map(s => `${s.source} (${s.status === "never_ran" ? "sin runs" : `detenido ${ago(s.hoursSince)}`})`)
    .join(" · ");
  const errLabel = h.errors24h.count > 0
    ? `${h.errors24h.count} error${h.errors24h.count === 1 ? "" : "es"} 24h: ${h.errors24h.routines.slice(0, 3).join(", ")}${h.errors24h.routines.length > 3 ? "…" : ""}`
    : null;
  const severe = h.stalled.length > 0;

  return (
    <div
      className="flex items-center gap-2 flex-wrap px-3 py-1.5 rounded-[3px]"
      style={{
        background: severe
          ? "color-mix(in oklab, var(--hall-danger) 8%, transparent)"
          : "color-mix(in oklab, var(--hall-warn) 10%, transparent)",
        border: `1px solid color-mix(in oklab, ${severe ? "var(--hall-danger)" : "var(--hall-warn)"} 30%, transparent)`,
      }}
    >
      <span
        className="uppercase tracking-[0.08em] font-bold shrink-0"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 9.5,
          color: severe ? "var(--hall-danger)" : "var(--hall-warn)",
        }}
      >
        ⚠ Pipeline
      </span>
      <span className="text-[11px] min-w-0" style={{ color: "var(--hall-ink-2)" }}>
        {h.stalled.length > 0 && <>Fuentes detenidas: {stalledLabel}.</>}
        {errLabel && <> {errLabel}.</>}
      </span>
      <Link
        href="/admin/routines"
        className="text-[9px] font-bold uppercase tracking-widest shrink-0 ml-auto hover:underline"
        style={{ color: "var(--hall-ink-0)" }}
      >
        Ver salud →
      </Link>
    </div>
  );
}

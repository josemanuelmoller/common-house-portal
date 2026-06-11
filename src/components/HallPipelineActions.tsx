"use client";

/**
 * HallPipelineActions — the ✓/✗ pair on each "Por cerrar" row of the Hall
 * Revenue card.
 *
 * Won  → POST /api/opportunity-outcome {outcome:'won'} (amount defaults to
 *        value_estimate; if the opp has none, asks for the final figure).
 *        The row leaves the pipeline and the amount appears as "vendido" in
 *        the card's progress line.
 * Lost → same endpoint with {outcome:'lost'} after an explicit confirm.
 *
 * The list and the card totals are server-rendered on /admin, so a successful
 * mutation triggers router.refresh() (soft re-render; client state survives).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  title: string;
  /** value_estimate if present — used as the default won amount */
  amount: number | null;
};

export function HallPipelineActions({ id, title, amount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"won" | "lost" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "won" | "lost") {
    if (busy) return;
    setError(null);

    let finalAmount: number | undefined;
    if (outcome === "won") {
      const raw = window.prompt(
        `Monto final de "${title}" (USD)`,
        amount && amount > 0 ? String(amount) : ""
      );
      if (raw === null) return; // cancelled
      finalAmount = Number(raw.replace(/[,$\s]/g, ""));
      if (!isFinite(finalAmount) || finalAmount <= 0) {
        setError("Monto inválido");
        return;
      }
    } else if (!window.confirm(`¿Marcar "${title}" como perdida?`)) {
      return;
    }

    setBusy(outcome);
    try {
      const res = await fetch("/api/opportunity-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, outcome, ...(finalAmount ? { amount: finalAmount } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const btnStyle: React.CSSProperties = {
    fontFamily: "var(--font-hall-mono)",
    fontSize: 8.5,
    letterSpacing: "0.06em",
    lineHeight: 1,
    padding: "3px 6px",
    borderRadius: 4,
    border: "1px solid var(--hall-line-soft)",
    background: "transparent",
    cursor: busy ? "wait" : "pointer",
  };

  return (
    <span className="shrink-0 inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => resolve("won")}
        disabled={busy !== null}
        title="Ganada — pasa a vendido en el card"
        className="uppercase font-bold hover:underline"
        style={{ ...btnStyle, color: "var(--hall-ok)" }}
      >
        {busy === "won" ? "…" : "✓ Ganada"}
      </button>
      <button
        type="button"
        onClick={() => resolve("lost")}
        disabled={busy !== null}
        title="Perdida — sale del pipeline, queda el histórico"
        className="uppercase font-bold hover:underline"
        style={{ ...btnStyle, color: "var(--hall-muted-2)" }}
      >
        {busy === "lost" ? "…" : "✗"}
      </button>
      {error && (
        <span className="text-[9px]" style={{ color: "var(--hall-warn)" }} title={error}>
          error
        </span>
      )}
    </span>
  );
}

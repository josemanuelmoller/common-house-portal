"use client";

/**
 * OpportunityStageControl — ADR-001 canonical-stage mover.
 *
 * Compact dropdown to move an opportunity through its canonical lifecycle
 * (exploration → proposal → won / lost / not_now). Winning only sets the stage
 * here; creating the project is a separate, deferred step (ADR-001 §4.3).
 *
 * PATCHes /api/admin/opportunities/[id] and router.refresh() on success.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = ["exploration", "proposal", "won", "lost", "not_now"] as const;
const STAGE_LABEL: Record<string, string> = {
  exploration: "Exploración",
  proposal: "Propuesta",
  won: "Ganada",
  lost: "Perdida",
  not_now: "No ahora",
};

// Display-only mirror of deriveCanonicalStage() for the null default.
function effectiveStage(canonical: string | null, status: string | null): string {
  if (canonical) return canonical;
  switch ((status ?? "").trim().toLowerCase()) {
    case "proposal sent":
      return "proposal";
    case "won":
      return "won";
    case "lost":
    case "closed lost":
      return "lost";
    default:
      return "exploration";
  }
}

export function OpportunityStageControl({
  id,
  status,
  canonical_stage,
}: {
  id: string;
  status: string | null;
  canonical_stage: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(effectiveStage(canonical_stage, status));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const derived = !canonical_stage;

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ canonical_stage: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setValue(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5 shrink-0">
      <select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        title={derived ? "Derived from legacy status — pick to make it explicit" : "Canonical stage"}
        className="text-[10px] uppercase tracking-wide"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontWeight: 700,
          color: "var(--hall-ink-0)",
          background: derived ? "transparent" : "var(--hall-fill-soft)",
          border: "1px solid var(--hall-line)",
          borderRadius: 3,
          padding: "2px 4px",
          outline: "none",
          fontStyle: derived ? "italic" : "normal",
        }}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[9px]" style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

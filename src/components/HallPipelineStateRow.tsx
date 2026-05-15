"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedPipelineRow } from "./HallPipelineState";

const REASON_COLOR: Record<SerializedPipelineRow["reason"], string> = {
  pre_meeting:    "var(--hall-warn)",
  ball_with_jose: "var(--hall-danger)",
  ball_with_them: "var(--hall-warn)",
  drift:          "var(--hall-muted-3)",
  healthy:        "var(--hall-ok)",
};

const TREND_GLYPH: Record<SerializedPipelineRow["trend"], string> = {
  heating: "↗",
  steady:  "→",
  cooling: "↘",
  cold:    "✕",
};

const TREND_COLOR: Record<SerializedPipelineRow["trend"], string> = {
  heating: "var(--hall-ok)",
  steady:  "var(--hall-muted-2)",
  cooling: "var(--hall-warn)",
  cold:    "var(--hall-danger)",
};

export function HallPipelineStateRow({ row }: { row: SerializedPipelineRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"primary" | "resolve" | "snooze" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function callApi(path: string, body: object): Promise<boolean> {
    setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (e) {
      setErr(String(e));
      return false;
    }
  }

  async function onPrimary() {
    setBusy("primary");
    const ok = await callApi("/api/pipeline-state/draft", {
      entityType: row.entityType,
      entityId:   row.entityId,
      action:     row.ctaPrimary.action,
      payload:    row.ctaPrimary.payload ?? {},
    });
    setBusy(null);
    if (ok) router.refresh();
  }

  async function onResolve() {
    setBusy("resolve");
    const ok = await callApi("/api/pipeline-state/resolve", {
      entityType: row.entityType,
      entityId:   row.entityId,
      reason:     row.reason,
    });
    setBusy(null);
    if (ok) router.refresh();
  }

  async function onSnooze(days: number) {
    setBusy("snooze");
    const ok = await callApi("/api/pipeline-state/snooze", {
      entityType: row.entityType,
      entityId:   row.entityId,
      days,
    });
    setBusy(null);
    if (ok) router.refresh();
  }

  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <div className="py-3 flex flex-col gap-2">
        {/* Header row: name + meta + CTAs */}
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 mt-1.5"
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: REASON_COLOR[row.reason],
            }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold truncate hover:underline"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {row.name}
                </a>
              ) : (
                <span
                  className="text-[13px] font-semibold truncate"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {row.name}
                </span>
              )}
              <MetaPills row={row} />
              {row.newSignalChip && (
                <span
                  className="uppercase tracking-[0.06em] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 9,
                    color: "var(--hall-ok)",
                    background: "color-mix(in oklab, var(--hall-ok) 12%, transparent)",
                  }}
                >
                  ↻ new signal
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {row.topics.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
                  Temas: {row.topics.join(" · ")}
                </span>
              )}
              {row.ballSummary && (
                <span className="text-[11px]" style={{ color: "var(--hall-ink-2)" }}>
                  {row.ballSummary}
                </span>
              )}
              <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
                <span style={{ color: TREND_COLOR[row.trend], fontWeight: 600, marginRight: 4 }}>
                  {TREND_GLYPH[row.trend]}
                </span>
                {row.reasonDetail}
              </span>
            </div>
          </div>

          {/* CTAs — suppressed on healthy rows (informational only). */}
          {row.reason !== "healthy" && (
            <div className="flex flex-col gap-1.5 items-end shrink-0">
              <button
                type="button"
                onClick={onPrimary}
                disabled={busy !== null}
                className="hall-btn-primary text-[11px] px-2.5 py-1 disabled:opacity-40 whitespace-nowrap"
              >
                {busy === "primary" ? "..." : row.ctaPrimary.label}
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onResolve}
                  disabled={busy !== null}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40 whitespace-nowrap"
                  style={{
                    borderColor: "var(--hall-line)",
                    color: "var(--hall-muted-1)",
                    fontFamily: "var(--font-hall-sans)",
                  }}
                  title="Cierra el loop subyacente y saca esta fila."
                >
                  {busy === "resolve" ? "..." : row.ctaResolveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onSnooze(3)}
                  disabled={busy !== null}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40"
                  style={{
                    borderColor: "var(--hall-line)",
                    color: "var(--hall-muted-1)",
                    fontFamily: "var(--font-hall-sans)",
                  }}
                  title="Oculta esta fila 3 días."
                >
                  Snooze 3d
                </button>
              </div>
            </div>
          )}
          {row.reason === "healthy" && (
            <span
              className="shrink-0 uppercase tracking-[0.08em] font-bold"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 9,
                color: "var(--hall-ok)",
              }}
            >
              ✓ healthy
            </span>
          )}
        </div>

        {err && (
          <p className="text-[10px] ml-5" style={{ color: "var(--hall-danger)" }}>
            {err}
          </p>
        )}
      </div>
    </li>
  );
}

function MetaPills({ row }: { row: SerializedPipelineRow }) {
  const pieces: { text: string; tone?: "default" | "danger" }[] = [];
  pieces.push({ text: row.kind === "client" ? "active client" : "prospect" });
  if (row.oppMeta?.status) pieces.push({ text: row.oppMeta.status.toLowerCase() });
  if (row.oppMeta?.priority) {
    const p = row.oppMeta.priority.split(" ")[0];
    pieces.push({ text: p, tone: p === "P1" ? "danger" : "default" });
  }
  if (row.oppMeta?.valueLabel) pieces.push({ text: row.oppMeta.valueLabel });

  return (
    <span
      className="flex items-center gap-1.5 flex-wrap text-[10.5px]"
      style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
    >
      {pieces.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span style={{ color: "var(--hall-muted-3)" }}>·</span>}
          <span
            style={{
              color: p.tone === "danger" ? "var(--hall-danger)" : undefined,
              fontWeight: p.tone === "danger" ? 700 : undefined,
            }}
          >
            {p.text}
          </span>
        </span>
      ))}
    </span>
  );
}

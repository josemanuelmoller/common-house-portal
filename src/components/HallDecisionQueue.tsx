"use client";

/**
 * HallDecisionQueue — "Needs your call" inline queue for the Hall.
 *
 * Agents propose (promotion-scan, project-operator, grant-monitor…) into
 * decision_items; until now those proposals only lived in /admin/os, a page
 * the telemetry says never gets visited — the queue died in April with 0
 * resolutions. This brings the decisions TO the flow: approve/dismiss inline
 * for simple ones, an explicit "Revisar →" hand-off to /admin/os for
 * execute-gated ones (entity mutations need the full review surface).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorText } from "@/lib/error-text";

export type HallDecision = {
  id: string;
  title: string;
  priority: string;        // "P1 Critical" | "P2 High" | ...
  sourceAgent: string;
  requiresExecute: boolean;
  dueDate: string | null;
};

export function HallDecisionQueue({ items }: { items: HallDecision[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const visible = items.filter(d => !gone.has(d.id));

  async function act(id: string, action: "resolve" | "dismiss") {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/resolve-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(errorText((j as { detail?: unknown }).detail, (j as { error?: unknown }).error, `HTTP ${res.status}`));
        return;
      }
      setGone(prev => new Set(prev).add(id));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (visible.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        Sin decisiones pendientes — los agentes proponen aquí cuando necesitan tu llamada.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {visible.slice(0, 5).map(d => {
        const isP1 = d.priority === "P1 Critical";
        return (
          <div
            key={d.id}
            className="py-2.5 flex items-start gap-2.5"
            style={{ borderTop: "1px solid var(--hall-line-soft)" }}
          >
            <span
              className="shrink-0 mt-1.5"
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: isP1 ? "var(--hall-danger)" : "var(--hall-warn)",
              }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>
                {d.title}
              </p>
              <p
                className="text-[10px] mt-0.5"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                {d.sourceAgent || "agente"}{d.dueDate ? ` · vence ${d.dueDate.slice(5)}` : ""}{isP1 ? " · P1" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {d.requiresExecute ? (
                <a
                  href="/admin/os"
                  className="text-[9px] font-bold uppercase tracking-widest hover:underline"
                  style={{ color: "var(--hall-ink-0)" }}
                  title="Esta decisión muta entidades — revisar el detalle antes de ejecutar."
                >
                  Revisar →
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, "resolve")}
                    className="hall-btn-primary disabled:opacity-40"
                    style={{ padding: "3px 9px", fontSize: 10 }}
                  >
                    {busy === d.id ? "…" : "Aprobar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, "dismiss")}
                    className="text-[9px] font-bold uppercase tracking-widest disabled:opacity-40"
                    style={{ color: "var(--hall-muted-3)" }}
                  >
                    Descartar
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {items.length > 5 && (
        <a
          href="/admin/os"
          className="text-[9px] font-bold uppercase tracking-widest mt-1.5 hover:underline"
          style={{ color: "var(--hall-muted-2)" }}
        >
          +{items.length - 5} más en Intake →
        </a>
      )}
      {err && (
        <p className="text-[10px] mt-1" style={{ color: "var(--hall-danger)" }}>{err}</p>
      )}
    </div>
  );
}

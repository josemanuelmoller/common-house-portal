"use client";

/**
 * HallPitchQueue — content pitches awaiting approve/reject, brought into the
 * Hall flow. The monthly propose-content-pitches cron was filling a queue in
 * /admin/plan/comms that nobody visited (8 pitches sat untouched for weeks).
 *
 * Approve closes the loop end-to-end: status → approved, then fire the
 * linkedin-post skill with the pitch as topic hint — the draft lands in the
 * Agent Queue for final sign-off. One decision here = a post draft waiting.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorText } from "@/lib/error-text";

export type HallPitch = {
  id: string;
  headline: string | null;
  angle: string | null;
  proposedForDate: string | null;
};

export function HallPitchQueue({ pitches }: { pitches: HallPitch[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const visible = pitches.filter(p => !gone.has(p.id));

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function act(p: HallPitch, action: "approve" | "reject") {
    setBusy(p.id);
    setErr(null);
    try {
      const res = await fetch("/api/approve-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchId: p.id, action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(errorText((j as { error?: unknown }).error, `HTTP ${res.status}`));
        return;
      }
      setGone(prev => new Set(prev).add(p.id));

      if (action === "approve") {
        // Close the loop: approved pitch → LinkedIn draft in the Agent Queue.
        // Fire-and-forget — a drafting failure doesn't undo the approval; the
        // pitch stays approved for the agent to pick up later.
        const hint = [p.headline, p.angle].filter(Boolean).join(" — ").slice(0, 500);
        fetch("/api/run-skill/linkedin-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic_hint: hint }),
        }).catch(() => { /* agent retry path covers it */ });
        flash("✓ Pitch aprobado — borrador de LinkedIn en camino a tu cola.");
      } else {
        flash("Pitch rechazado.");
      }
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
        Sin pitches esperando. El agente propone nuevos el último viernes de cada mes.
      </p>
    );
  }

  return (
    <div className="flex flex-col relative">
      {toast && (
        <p className="text-[10px] font-bold mb-1.5" style={{ color: "var(--hall-ok)" }}>{toast}</p>
      )}
      {visible.slice(0, 6).map(p => (
        <div
          key={p.id}
          className="py-2.5 flex items-start gap-2.5"
          style={{ borderTop: "1px solid var(--hall-line-soft)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>
              {p.headline ?? "(sin titular)"}
            </p>
            {p.angle && (
              <p className="text-[10.5px] mt-0.5 line-clamp-2" style={{ color: "var(--hall-muted-2)" }}>
                {p.angle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => act(p, "approve")}
              className="hall-btn-primary disabled:opacity-40"
              style={{ padding: "3px 9px", fontSize: 10 }}
            >
              {busy === p.id ? "…" : "Aprobar"}
            </button>
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => act(p, "reject")}
              className="text-[9px] font-bold uppercase tracking-widest disabled:opacity-40"
              style={{ color: "var(--hall-muted-3)" }}
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
      {err && <p className="text-[10px] mt-1" style={{ color: "var(--hall-danger)" }}>{err}</p>}
    </div>
  );
}

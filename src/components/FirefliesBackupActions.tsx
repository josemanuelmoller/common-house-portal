"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Busy = null | "backup" | "capture" | "dryrun" | "prune";

interface DryRun {
  requested: number;
  processed: { id: string; title: string | null; minutes: number }[];
  minutes_freed: number;
}

export function FirefliesBackupActions({ eligibleIds }: { eligibleIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) throw new Error(j?.error ?? `HTTP ${res.status}`);
    return j;
  }

  async function runBackup() {
    setBusy("backup"); setMsg(null);
    try {
      const j = await post("/api/fireflies-backup/reconcile", { execute: true });
      setMsg(`Respaldo: ${j.backed_up_now ?? 0} nuevas · ${j.missing ?? 0} pendientes${j.rate_limited ? " · rate-limited" : ""}`);
      router.refresh();
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  }

  async function runCapture() {
    setBusy("capture"); setMsg(null);
    try {
      const j = await post("/api/fireflies-backup/capture-reconcile", {});
      setMsg(`Captura: ${j.matched ?? 0} matched · ${j.spontaneous?.length ?? 0} espontáneas · ${j.capture_gaps?.length ?? 0} sin grabar`);
      router.refresh();
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  }

  async function prepareDelete() {
    setBusy("dryrun"); setMsg(null); setDryRun(null);
    try {
      const j = await post("/api/fireflies-backup/prune", { ids: eligibleIds, execute: false });
      setDryRun({ requested: j.requested ?? 0, processed: j.processed ?? [], minutes_freed: j.minutes_freed ?? 0 });
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  }

  async function confirmDelete() {
    if (!dryRun) return;
    setBusy("prune"); setMsg(null);
    try {
      const ids = dryRun.processed.map((p) => p.id);
      const j = await post("/api/fireflies-backup/prune", { ids, execute: true });
      setMsg(`Borradas ${j.processed?.length ?? 0} · ${j.minutes_freed ?? 0} min liberados${j.rate_capped ? ` · quedan ${j.remaining} (límite 8/min, repite)` : ""}`);
      setDryRun(null);
      router.refresh();
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  }

  const btn = "rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null} onClick={runBackup}
          className={`${btn} bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]/85`}>
          {busy === "backup" ? "Respaldando…" : "Respaldar ahora"}
        </button>
        <button type="button" disabled={busy !== null} onClick={runCapture}
          className={`${btn} bg-[#0a0a0a]/8 text-[#0a0a0a] hover:bg-[#0a0a0a]/15`}>
          {busy === "capture" ? "Revisando…" : "Chequear captura"}
        </button>

        {eligibleIds.length > 0 && !dryRun && (
          <button type="button" disabled={busy !== null} onClick={prepareDelete}
            className={`${btn} bg-red-50 text-red-700 border border-red-200 hover:bg-red-100`}>
            {busy === "dryrun" ? "Calculando…" : `Revisar borrado (${eligibleIds.length})`}
          </button>
        )}
      </div>

      {dryRun && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-2">
          <p className="text-[12px] text-red-900 font-semibold">
            Se borrarán {dryRun.processed.length} reuniones de Fireflies · libera {dryRun.minutes_freed} min.
            Ya están respaldadas en Drive. Esto es irreversible.
          </p>
          {dryRun.processed.length > 0 && (
            <ul className="text-[11px] text-red-800/80 max-h-40 overflow-auto space-y-0.5">
              {dryRun.processed.slice(0, 30).map((p) => (
                <li key={p.id}>· {p.title ?? p.id} <span className="opacity-60">({p.minutes}m)</span></li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={busy !== null} onClick={confirmDelete}
              className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              {busy === "prune" ? "Borrando…" : "Confirmar borrado"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setDryRun(null)}
              className={`${btn} bg-[#0a0a0a]/8 text-[#0a0a0a] hover:bg-[#0a0a0a]/15`}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-[11px] text-[#0a0a0a]/60">{msg}</p>}
    </div>
  );
}

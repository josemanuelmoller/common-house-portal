"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Busy = null | "backup" | "capture" | "dryrun" | "prune";

interface DryRun {
  requested: number;
  processed: { id: string; title: string | null; minutes: number }[];
  minutes_freed: number;
}

interface Progress {
  done: number;
  total: number;
  minutes: number;
  /** Seconds left on the Fireflies rate-limit wait, 0 while actually deleting. */
  wait: number;
  errors: string[];
}

interface PruneResponse {
  processed?: { id: string; title: string | null; minutes: number }[];
  skipped?: { id: string; reason: string; retryable: boolean }[];
  minutes_freed?: number;
  remaining?: number;
  rate_capped?: boolean;
  rate_limited?: boolean;
  retry_after_ms?: number;
}

/**
 * Fireflies caps deleteTranscript at ~10/min, so the API deletes at most 8 per
 * call and tells us when to come back. Draining the backlog is therefore a
 * client-side loop: N calls spaced by the rate-limit window. It lives here
 * rather than server-side because a multi-batch server run would exceed the
 * serverless timeout and lose everything it had already done.
 */
const MAX_ROUNDS = 40; // backstop: 40 × 8 = 320 deletions in one sitting

export function FirefliesBackupActions({ eligibleIds }: { eligibleIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stopRef = useRef(false);

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
    setBusy("dryrun"); setMsg(null); setDryRun(null); setProgress(null);
    try {
      const j = await post("/api/fireflies-backup/prune", { ids: eligibleIds, execute: false });
      setDryRun({ requested: j.requested ?? 0, processed: j.processed ?? [], minutes_freed: j.minutes_freed ?? 0 });
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  }

  /** Interruptible wait that ticks the countdown so the panel never looks hung. */
  async function waitWithCountdown(ms: number, update: (secondsLeft: number) => void) {
    let left = Math.ceil(ms / 1000);
    while (left > 0 && !stopRef.current) {
      update(left);
      await new Promise((r) => setTimeout(r, 1000));
      left--;
    }
    update(0);
  }

  async function confirmDelete() {
    if (!dryRun) return;
    stopRef.current = false;
    setBusy("prune"); setMsg(null);

    let pending = dryRun.processed.map((p) => p.id);
    const total = pending.length;
    let done = 0;
    let minutes = 0;
    const errors: string[] = [];
    const show = (wait: number) => setProgress({ done, total, minutes, wait, errors: [...errors] });
    show(0);

    try {
      for (let round = 0; round < MAX_ROUNDS && pending.length > 0 && !stopRef.current; round++) {
        const before = pending.length;
        const j: PruneResponse = await post("/api/fireflies-backup/prune", { ids: pending, execute: true });

        const processed = j.processed ?? [];
        const skipped = j.skipped ?? [];
        done += processed.length;
        minutes += j.minutes_freed ?? 0;

        // An id leaves the worklist when it was deleted or when it failed in a
        // way that retrying cannot fix. Rate-limited ids stay in for next round.
        const settled = new Set<string>([
          ...processed.map((p) => p.id),
          ...skipped.filter((s) => !s.retryable).map((s) => s.id),
        ]);
        for (const s of skipped) {
          if (!s.retryable && errors.length < 5) errors.push(`${s.id}: ${s.reason}`);
        }
        pending = pending.filter((id) => !settled.has(id));
        show(0);

        if (pending.length === 0) break;

        // No id left the list and Fireflies isn't asking us to wait — retrying
        // would spin forever. Stop and say so instead of looping silently.
        if (pending.length === before && !j.rate_limited) {
          errors.push("Sin avance en esta ronda — detenido para no repetir en vano.");
          break;
        }

        await waitWithCountdown(j.retry_after_ms || 62_000, (s) => show(s));
      }

      const tail = stopRef.current
        ? " · detenido por ti"
        : pending.length > 0
        ? ` · quedan ${pending.length} (dale de nuevo)`
        : "";
      setMsg(`Borradas ${done} de ${total} · ${minutes} min liberados${tail}`);
      setDryRun(null);
      router.refresh();
    } catch (e) {
      setMsg(`Borradas ${done} de ${total} · ${minutes} min liberados · se cortó: ${e instanceof Error ? e.message : String(e)}`);
      router.refresh();
    } finally {
      setBusy(null);
      setProgress(null);
      stopRef.current = false;
    }
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

        {eligibleIds.length > 0 && !dryRun && busy !== "prune" && (
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
          <p className="text-[11px] text-red-800/70">
            Fireflies sólo acepta ~10 borrados por minuto, así que va en tandas de 8 con una pausa entre medio:
            ~{Math.ceil(dryRun.processed.length / 8)} tandas, unos {Math.ceil((dryRun.processed.length / 8) * 62 / 60)} min.
            Podés parar cuando quieras y lo hecho queda hecho.
          </p>
          {dryRun.processed.length > 0 && (
            <ul className="text-[11px] text-red-800/80 max-h-40 overflow-auto space-y-0.5">
              {dryRun.processed.slice(0, 30).map((p) => (
                <li key={p.id}>· {p.title ?? p.id} <span className="opacity-60">({p.minutes}m)</span></li>
              ))}
              {dryRun.processed.length > 30 && (
                <li className="opacity-60">· … y {dryRun.processed.length - 30} más</li>
              )}
            </ul>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={busy !== null} onClick={confirmDelete}
              className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              Confirmar borrado
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setDryRun(null)}
              className={`${btn} bg-[#0a0a0a]/8 text-[#0a0a0a] hover:bg-[#0a0a0a]/15`}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-red-900 font-semibold">
              Borradas {progress.done} de {progress.total} · {progress.minutes} min liberados
              {progress.wait > 0 && <span className="font-normal opacity-70"> · esperando {progress.wait}s (límite de Fireflies)</span>}
            </p>
            <button type="button" onClick={() => { stopRef.current = true; }}
              className={`${btn} bg-[#0a0a0a]/8 text-[#0a0a0a] hover:bg-[#0a0a0a]/15 shrink-0`}>
              Parar
            </button>
          </div>
          <div className="h-1 rounded-full bg-red-200/60 overflow-hidden">
            <div className="h-full bg-red-600 transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          {progress.errors.length > 0 && (
            <ul className="text-[11px] text-red-800/80 space-y-0.5">
              {progress.errors.map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {msg && <p className="text-[11px] text-[#0a0a0a]/60">{msg}</p>}
    </div>
  );
}

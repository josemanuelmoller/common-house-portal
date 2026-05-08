"use client";

/**
 * Admin button that triggers the OS v2 maintenance cadence on demand.
 * Posts to /api/cron/run-os-cycle (which accepts admin sessions in addition
 * to CRON_SECRET). Renders the per-step result inline once the run completes.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type StepResult = {
  step: string;
  status: "ok" | "skipped" | "error";
  duration_ms: number;
  error?: string;
};

type RunResult = {
  ok: boolean;
  duration_ms: number;
  summary: { total: number; ok: number; errors: number; skipped: number };
  results: StepResult[];
};

export function RunOsCycleButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function runCycle() {
    setState("running");
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await fetch("/api/cron/run-os-cycle", { method: "POST" });
      const data = (await res.json()) as RunResult & { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runCycle}
        disabled={state === "running"}
        className="hall-btn-primary inline-flex items-center gap-2"
        style={{ fontSize: 12 }}
      >
        {state === "running" ? (
          <>
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "currentColor" }} />
            Running pipeline…
          </>
        ) : state === "done" ? (
          "Run pipeline again"
        ) : (
          "Run OS pipeline now"
        )}
      </button>

      {state === "error" && (
        <p
          className="text-[11px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
        >
          ⨯ {errorMsg}
        </p>
      )}

      {state === "done" && result && (
        <div
          className="border p-2 text-[11px]"
          style={{
            borderColor: "var(--hall-line)",
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-ink-1)",
          }}
        >
          <p className="font-bold">
            {result.summary.ok}/{result.summary.total} steps ok
            {result.summary.errors > 0 ? ` · ${result.summary.errors} errors` : ""}
            {" · "}
            {(result.duration_ms / 1000).toFixed(1)}s
          </p>
          <ul className="mt-1 space-y-0.5">
            {result.results.map((r) => (
              <li key={r.step} className="flex items-center justify-between gap-2">
                <span>
                  {r.status === "ok" ? "✓" : r.status === "skipped" ? "·" : "⨯"}{" "}
                  {r.step}
                </span>
                <span style={{ color: "var(--hall-muted-2)" }}>
                  {(r.duration_ms / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

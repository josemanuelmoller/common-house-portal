"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Status = "new" | "acknowledged" | "resolved" | "silenced";

async function updateStatus(cluster_key: string, status: Status) {
  const res = await fetch("/api/agent-health/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cluster_key, status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

export function AgentHealthActions({
  clusterKey,
  currentStatus,
}: {
  clusterKey: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const go = (next: Status) => {
    setErr(null);
    startTransition(async () => {
      try {
        await updateStatus(clusterKey, next);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const btn = (label: string, next: Status, muted = false) => (
    <button
      key={label}
      disabled={pending || currentStatus === next}
      onClick={() => go(next)}
      className="px-2.5 py-1 rounded"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: muted ? "var(--hall-muted-2)" : "var(--hall-ink-0)",
        background: currentStatus === next ? "var(--hall-fill-soft)" : "transparent",
        border: "1px solid var(--hall-line)",
        cursor: pending || currentStatus === next ? "default" : "pointer",
        opacity: pending ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {currentStatus !== "acknowledged" && btn("Acknowledge", "acknowledged")}
      {currentStatus !== "resolved" && btn("Resolve", "resolved")}
      {currentStatus !== "silenced" && btn("Silence", "silenced", true)}
      {(currentStatus === "resolved" || currentStatus === "silenced") && btn("Re-open", "new")}
      {err && (
        <span
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            color: "var(--hall-danger)",
          }}
        >
          {err}
        </span>
      )}
    </div>
  );
}

export function DiagnoseButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/diagnose-agent-errors", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setMsg(
          `Scanned ${body.errors_scanned ?? 0} errors · ${body.clusters ?? 0} clusters · ${body.created ?? 0} new · ${body.updated ?? 0} updated`
        );
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            color: "var(--hall-muted-2)",
          }}
        >
          {msg}
        </span>
      )}
      <button
        onClick={run}
        disabled={pending}
        className="hall-btn-ghost"
        style={{ fontSize: 11, opacity: pending ? 0.5 : 1 }}
      >
        {pending ? "Diagnosing…" : "Diagnose now ↗"}
      </button>
    </div>
  );
}

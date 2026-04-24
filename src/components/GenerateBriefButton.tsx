"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GenerateBriefButton({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<"idle" | "generating" | "error" | "done">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    if (status === "generating") return;
    setStatus("generating");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/generate-prep-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Admin-initiated: backend expects cron secret OR admin guard.
          // Since this endpoint uses CRON_SECRET only, server-action variant would
          // be cleaner — for now rely on a same-origin fetch with admin session
          // carried via cookies. If unauthorized, show the error to the user.
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setStatus("done");
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "generating"}
        className="inline-flex items-center gap-2 bg-[#c6f24a] text-[#0a0a0a] text-[11px] font-bold uppercase tracking-widest px-3 py-2 rounded-full hover:bg-[#9ee84a] transition-colors disabled:opacity-60"
      >
        {status === "generating" ? "Generando…" : status === "done" ? "✓ Generado — regenerar" : "⎘ Generate brief"}
      </button>
      {status === "error" && errorMsg && (
        <span className="text-[11px] text-red-300 font-medium">
          Error: {errorMsg}
        </span>
      )}
    </div>
  );
}

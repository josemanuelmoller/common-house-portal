"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SynthesizeLeafButton({ path, hasPlaybook }: { path: string; hasPlaybook: boolean }) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    if (status === "running") return;
    setStatus("running");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/synthesize-leaf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
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
        onClick={handleClick}
        disabled={status === "running"}
        className="inline-flex items-center gap-2 bg-[#c6f24a] text-[#0a0a0a] text-[11px] font-bold uppercase tracking-widest px-3 py-2 rounded-full hover:bg-[#9ee84a] transition-colors disabled:opacity-60"
      >
        {status === "running" ? "Sintetizando…"
          : hasPlaybook ? "⟳ Regenerar playbook"
          : "✦ Generar playbook"}
      </button>
      {status === "error" && errorMsg && (
        <span className="text-[11px] text-red-300 font-medium">{errorMsg}</span>
      )}
    </div>
  );
}

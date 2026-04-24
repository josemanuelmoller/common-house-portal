"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline button that re-runs the LinkedIn enrichment agent for a single
 * person. Bypasses the 6-month cooldown. Used on the contact profile page.
 */
export function ReEnrichButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  async function run() {
    setRunning(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/linkedin-enrichment/re-enrich", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "re-enrich failed");
      if (!j.match) setMsg("No plausible LinkedIn profile found");
      else setMsg(`Found: ${j.match.url} · ${Math.round(j.match.confidence * 100)}% match · ${j.action.replace("_", " ")}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={running}
        className="text-[10px] font-bold uppercase tracking-widest border border-[#0a0a0a]/20 text-[#0a0a0a]/70 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/50 px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        {running ? "Re-enriching…" : "🔄 Re-enrich"}
      </button>
      {msg && <span className="text-[10px] text-[#0a0a0a]/60">{msg}</span>}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}

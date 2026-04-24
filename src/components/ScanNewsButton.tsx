"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Button on the contact profile's "Recent mentions" section that triggers an
 * on-demand news + LinkedIn scan for this contact (bypasses the biweekly
 * cooldown). Uses POST /api/contact-news/scan with ?force=1.
 */
export function ScanNewsButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [msg, setMsg]         = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  async function run() {
    setRunning(true);
    setErr(null);
    setMsg(null);
    try {
      const url = `/api/contact-news/scan?person_id=${encodeURIComponent(personId)}&force=1`;
      const res = await fetch(url, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "scan failed");
      const out = (j.outcomes ?? [])[0];
      const found = out?.found ?? 0;
      const inserted = out?.inserted ?? 0;
      if (found === 0)      setMsg("No recent mentions found");
      else if (inserted === 0) setMsg(`${found} mentions — all already known`);
      else                  setMsg(`${inserted} new mention${inserted === 1 ? "" : "s"}`);
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
        {running ? "Scanning…" : "📰 Scan news"}
      </button>
      {msg && <span className="text-[10px] text-[#0a0a0a]/60">{msg}</span>}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}

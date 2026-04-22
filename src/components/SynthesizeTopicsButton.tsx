"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Button on the contact profile that asks Claude Haiku to distill recurring
 * topics from the contact's meeting titles + transcript titles. Caches the
 * result in people.recurring_topics. First click synthesises; subsequent
 * clicks use the cache unless `force` is passed.
 */
export function SynthesizeTopicsButton({
  personId,
  label = "Synthesise topics",
  force = false,
}: {
  personId: string;
  label?:   string;
  force?:   boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  async function run() {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch("/api/contact-topics/synthesize", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId, force }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "synthesis failed");
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
        className="text-[10px] font-bold uppercase tracking-widest border border-[#131218]/20 text-[#131218]/70 hover:text-[#131218] hover:border-[#131218]/50 px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        {running ? "Thinking…" : `✨ ${label}`}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}

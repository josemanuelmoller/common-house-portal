"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fires once on mount: triggers a delta calendar sync, then refreshes the
 * server-rendered contact list. Silent on success, shows a small status pill
 * while running / on error.
 *
 * Rate-limited to once per minute per mount via sessionStorage so navigating
 * back and forth does not hammer Google.
 */
export function HallContactsAutoRefresh() {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const lastRunKey = "hall-contacts-last-refresh";
    const last = Number(sessionStorage.getItem(lastRunKey) ?? "0");
    if (Date.now() - last < 60_000) return;  // throttle: 60s per tab

    (async () => {
      setStatus("syncing");
      try {
        const res = await fetch("/api/cron/observe-calendar", {
          method:      "POST",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok === false) {
          setStatus("error");
          setSummary(j?.reason ?? j?.error ?? `HTTP ${res.status}`);
          return;
        }
        sessionStorage.setItem(lastRunKey, String(Date.now()));
        const changed = (j?.new_events ?? 0) + (j?.updated_events ?? 0) + (j?.cancelled_events ?? 0);
        setStatus("done");
        setSummary(
          changed === 0
            ? "No calendar changes"
            : `${j.new_events ?? 0} new · ${j.updated_events ?? 0} updated · ${j.cancelled_events ?? 0} cancelled`,
        );
        if (changed > 0) router.refresh();
        setTimeout(() => setStatus("idle"), 4000);
      } catch (err) {
        setStatus("error");
        setSummary(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [router]);

  if (status === "idle") return null;

  const base = "text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full";
  const cls =
    status === "syncing" ? `${base} bg-[#0a0a0a]/6 text-[#0a0a0a]/60`
    : status === "done"  ? `${base} bg-[#c6f24a]/30 text-green-900`
    :                      `${base} bg-red-100 text-red-700`;

  return (
    <div className="flex items-center gap-2">
      <span className={cls}>
        {status === "syncing" && "Syncing calendar…"}
        {status === "done"    && (summary ?? "Synced")}
        {status === "error"   && "Sync error"}
      </span>
      {status === "error" && summary && (
        <span className="text-[10px] text-red-700/70 truncate max-w-[320px]" title={summary}>{summary}</span>
      )}
    </div>
  );
}

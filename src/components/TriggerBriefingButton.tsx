"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "loading" | "done" | "error";

export function TriggerBriefingButton() {
  const [state, setState] = useState<State>("idle");
  const router = useRouter();

  async function trigger() {
    setState("loading");
    try {
      const res = await fetch("/api/generate-daily-briefing", { method: "POST" });
      if (res.ok) {
        setState("done");
        router.refresh();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  // Reset to idle so the user can retry without a full reload.
  if (state === "done") {
    setTimeout(() => setState("idle"), 4000);
  }

  return (
    <button
      onClick={trigger}
      disabled={state === "loading" || state === "done"}
      // hall-btn-primary = solid ink-0 per PORTAL_DESIGN — lime is reserved
      // for Focus / LIVE / brand only.
      className="hall-btn-primary shrink-0 text-[11px] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {state === "loading" ? "Generating…"
        : state === "done"    ? "Done — actualizando…"
        : state === "error"   ? "Error — retry"
        : "Generate briefing"}
    </button>
  );
}

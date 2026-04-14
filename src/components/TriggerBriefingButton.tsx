"use client";

import { useState } from "react";

type State = "idle" | "loading" | "done" | "error";

export function TriggerBriefingButton() {
  const [state, setState] = useState<State>("idle");

  async function trigger() {
    setState("loading");
    try {
      const res = await fetch("/api/generate-daily-briefing", { method: "POST" });
      if (res.ok) {
        setState("done");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={trigger}
      disabled={state === "loading" || state === "done"}
      className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#c8f55a] text-[#131218] hover:bg-[#b8e54a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {state === "loading" ? "Generating…"
        : state === "done"    ? "Done — reloading…"
        : state === "error"   ? "Error — retry"
        : "Generate briefing"}
    </button>
  );
}

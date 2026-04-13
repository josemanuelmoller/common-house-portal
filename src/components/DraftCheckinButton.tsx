"use client";

import { useState } from "react";

export function DraftCheckinButton({
  personId,
  notionUrl,
}: {
  personId: string;
  notionUrl: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleDraft() {
    setState("loading");
    try {
      const res = await fetch("/api/run-skill/draft-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (res.ok) {
        setState("done");
        setTimeout(() => setState("idle"), 3000);
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 2000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  if (state === "done") {
    return (
      <span className="text-[9px] font-bold text-emerald-600 shrink-0">
        ✓ Draft saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <a
        href={notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] font-bold text-red-400 shrink-0"
      >
        Error ↗
      </a>
    );
  }

  return (
    <button
      onClick={handleDraft}
      disabled={state === "loading"}
      className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors disabled:opacity-50"
    >
      {state === "loading" ? "…" : "Draft →"}
    </button>
  );
}

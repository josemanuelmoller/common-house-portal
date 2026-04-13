"use client";

import { useState } from "react";

export function DraftFollowupButton({
  opportunityId,
  notionUrl,
}: {
  opportunityId: string;
  notionUrl: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleDraft() {
    setState("loading");
    try {
      const res = await fetch("/api/run-skill/draft-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
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
      <span className="text-[10px] font-bold text-emerald-600 shrink-0">
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
        className="text-[10px] font-bold text-red-500 shrink-0"
      >
        Error — open Notion
      </a>
    );
  }

  return (
    <button
      onClick={handleDraft}
      disabled={state === "loading"}
      className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors shrink-0 border border-[#E0E0D8] rounded-lg px-2.5 py-1.5 disabled:opacity-50"
    >
      {state === "loading" ? "Drafting…" : "Draft email →"}
    </button>
  );
}

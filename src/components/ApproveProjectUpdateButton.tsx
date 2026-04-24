"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "loading" | "done" | "error";

export function ApproveProjectUpdateButton({
  projectId,
  draftText,
}: {
  projectId: string;
  draftText?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [activeAction, setActiveAction] = useState<"approve" | "dismiss" | null>(null);

  async function act(action: "approve" | "dismiss") {
    setState("loading");
    setActiveAction(action);
    try {
      const res = await fetch("/api/admin/approve-project-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action, draftText }),
      });
      if (res.ok) {
        setState("done");
        setTimeout(() => router.refresh(), 800);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className="shrink-0 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
        {activeAction === "approve" ? "Approved ✓" : "Dismissed ✓"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => act("dismiss")}
        disabled={state === "loading"}
        className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-[#0a0a0a]/15 text-[#0a0a0a]/40 hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a]/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {state === "loading" && activeAction === "dismiss" ? "…" : "Dismiss"}
      </button>
      {draftText && (
        <button
          onClick={() => act("approve")}
          disabled={state === "loading"}
          className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#b8e54a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === "loading" && activeAction === "approve" ? "Approving…" : "Approve update"}
        </button>
      )}
      {state === "error" && (
        <span className="text-[10px] font-bold text-red-500">Error — retry</span>
      )}
    </div>
  );
}

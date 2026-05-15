"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PromoteButton({
  landscapeId,
  alreadyPromoted,
}: {
  landscapeId: string;
  alreadyPromoted: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    alreadyPromoted ? "done" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (state === "done") {
    return (
      <span
        className="text-[10px] uppercase tracking-[0.06em] px-2 py-1"
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-muted-2)",
          border: "1px solid var(--hall-line-soft)",
          borderRadius: 2,
        }}
        title="Already in CH network"
      >
        ✓ in network
      </span>
    );
  }

  async function promote() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/landscape/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ landscapeId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState("error");
        setErrorMsg(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setState("done");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <button
        type="button"
        onClick={promote}
        disabled={state === "loading"}
        className="text-[10px] uppercase tracking-[0.06em] px-2 py-1"
        style={{
          fontFamily: "var(--font-hall-mono)",
          border: "1px solid var(--hall-ink-0)",
          borderRadius: 2,
          background: "var(--hall-paper-0)",
          color: "var(--hall-ink-0)",
          opacity: state === "loading" ? 0.5 : 1,
        }}
      >
        {state === "loading" ? "…" : "+ to network"}
      </button>
      {errorMsg && (
        <span
          className="text-[10px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}

"use client";

/**
 * ClassifyRelationshipActions — approve / reject buttons for a
 * `decision_items` row with `entity_action='classify_relationship'`.
 *
 * Wired against `src/app/admin/decisions/relationship-actions.ts`. On a
 * successful response, calls `router.refresh()` so the server-rendered
 * Decision Center re-fetches the open proposal list (per AGENTS.md
 * client-component-refresh-rules).
 *
 * On error: inline message, no alert/throw.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveRelationshipClassification,
  rejectRelationshipClassification,
} from "@/app/admin/decisions/relationship-actions";

interface Props {
  decisionId: string;
  proposedClass: string;
}

export function ClassifyRelationshipActions({
  decisionId,
  proposedClass,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const disabled = busy !== null || isPending || done !== null;

  function onApprove() {
    setError(null);
    setBusy("approve");
    startTransition(async () => {
      try {
        const res = await approveRelationshipClassification(decisionId);
        if (!res.ok) {
          setError(res.error ?? "Approve failed");
          setBusy(null);
          return;
        }
        setDone(`Classified as ${proposedClass}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    });
  }

  function onReject() {
    setError(null);
    let reason: string | undefined;
    if (typeof window !== "undefined") {
      const r = window.prompt("Reason for rejecting (optional):") ?? "";
      reason = r.trim() ? r.trim() : undefined;
    }
    setBusy("reject");
    startTransition(async () => {
      try {
        const res = await rejectRelationshipClassification(decisionId, reason);
        if (!res.ok) {
          setError(res.error ?? "Reject failed");
          setBusy(null);
          return;
        }
        setDone("Rejected");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    });
  }

  if (done) {
    return (
      <p
        className="text-[10px] italic mt-2"
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-muted-3)",
        }}
      >
        {done}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="hall-btn-primary disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : `Approve as ${proposedClass}`}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="text-[11px] font-medium px-3 py-1 rounded-md disabled:opacity-50 transition-colors"
          style={{
            color: "var(--hall-muted-2)",
            border: "1px solid var(--hall-line)",
            background: "transparent",
          }}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && (
        <p
          className="text-[10px] font-medium"
          style={{ color: "var(--hall-danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

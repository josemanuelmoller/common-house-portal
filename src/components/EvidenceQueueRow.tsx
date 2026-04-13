"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "./StatusBadge";
import { markEvidenceReviewed, rejectEvidence } from "@/app/admin/os/actions";

type Props = {
  id: string;
  title: string;
  excerpt: string;
  projectName: string;
  type: string;
  validationStatus: string;
  dateCaptured: string | null;
};

export function EvidenceQueueRow({ id, title, excerpt, projectName, type, validationStatus, dateCaptured }: Props) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"reviewed" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleReview() {
    setError(null);
    startTransition(async () => {
      try {
        await markEvidenceReviewed(id);
        setDone("reviewed");
      } catch {
        setError("Failed to mark as reviewed. Try again.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectEvidence(id);
        setDone("rejected");
      } catch {
        setError("Failed to reject. Try again.");
      }
    });
  }

  // Fade out once actioned
  if (done) {
    return (
      <tr className="opacity-40 transition-opacity">
        <td className="px-6 py-3 text-sm text-[#131218]/40 italic">
          {done === "reviewed" ? "✓ Reviewed" : "✕ Rejected"} — {title}
        </td>
        <td colSpan={4} />
      </tr>
    );
  }

  return (
    <tr className={`transition-colors ${isPending ? "opacity-50" : "hover:bg-[#EFEFEA]/60"}`}>
      <td className="px-6 py-3">
        <p className="font-semibold text-[#131218] text-sm">{title}</p>
        {excerpt && (
          <p className="text-xs text-[#131218]/35 mt-0.5 line-clamp-1 max-w-sm">{excerpt}</p>
        )}
        {error && (
          <p className="text-[10px] text-red-500 mt-1 font-medium">{error}</p>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-[#131218]/50">
        {projectName || "—"}
      </td>
      <td className="px-4 py-3"><StatusBadge value={type} /></td>
      <td className="px-4 py-3"><StatusBadge value={validationStatus} /></td>
      <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
        {dateCaptured
          ? new Date(dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReview}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#B2FF59] text-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-[#9ee84a] transition-colors disabled:opacity-50"
            title="Mark as Reviewed — engine validates from here"
          >
            {isPending ? "..." : "✓ Reviewed"}
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#131218]/8 text-[#131218]/50 px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : "✕"}
          </button>
        </div>
      </td>
    </tr>
  );
}

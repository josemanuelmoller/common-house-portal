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
  // optional batch-select props (provided by EvidenceQueueTable)
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDismiss?: (id: string) => void;
};

export function EvidenceQueueRow({ id, title, excerpt, projectName, type, validationStatus, dateCaptured, isSelected, onToggleSelect, onDismiss }: Props) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"reviewed" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleReview() {
    setError(null);
    startTransition(async () => {
      try {
        await markEvidenceReviewed(id);
        setDone("reviewed");
        onDismiss?.(id);
      } catch {
        setError("Failed. Try again.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectEvidence(id);
        setDone("rejected");
        onDismiss?.(id);
      } catch {
        setError("Failed. Try again.");
      }
    });
  }

  // Fade out once actioned
  if (done) {
    return (
      <tr className="opacity-40 transition-opacity">
        {onToggleSelect && <td className="px-4 py-3 w-8" />}
        <td className="px-2 py-3 text-sm text-[#0a0a0a]/40 italic">
          {done === "reviewed" ? "✓ Aceptado" : "✕ Rechazado"} — {title}
        </td>
        <td colSpan={onToggleSelect ? 5 : 4} />
      </tr>
    );
  }

  return (
    <tr className={`transition-colors ${isPending ? "opacity-50" : isSelected ? "bg-[#c6f24a]/10" : "hover:bg-[#f4f4ef]/60"}`}>
      {/* Checkbox — only when used inside EvidenceQueueTable */}
      {onToggleSelect && (
        <td className="px-4 py-3 w-8">
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect(id)}
            className="rounded border-[#e4e4dd] accent-[#0a0a0a] cursor-pointer"
          />
        </td>
      )}
      <td className={onToggleSelect ? "px-2 py-3" : "px-6 py-3"}>
        <p className="font-semibold text-[#0a0a0a] text-sm">{title}</p>
        {excerpt && (
          <p className="text-xs text-[#0a0a0a]/35 mt-0.5 line-clamp-1 max-w-sm">{excerpt}</p>
        )}
        {error && (
          <p className="text-[10px] text-red-500 mt-1 font-medium">{error}</p>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-[#0a0a0a]/50">
        {projectName || "—"}
      </td>
      <td className="px-4 py-3"><StatusBadge value={type} /></td>
      <td className="px-4 py-3"><StatusBadge value={validationStatus} /></td>
      <td className="px-4 py-3 text-xs text-[#0a0a0a]/35 font-medium">
        {dateCaptured
          ? new Date(dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReview}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#c6f24a] text-[#0a0a0a] px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-[#9ee84a] transition-colors disabled:opacity-50"
            title="Mark as Reviewed"
          >
            {isPending ? "..." : "✓"}
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#0a0a0a]/8 text-[#0a0a0a]/50 px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : "✕"}
          </button>
        </div>
      </td>
    </tr>
  );
}

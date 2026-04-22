"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptSplitProposal, acceptAmendProposal, rejectProposal } from "@/app/admin/knowledge/actions";

type Props = {
  changelogId: string;
  action: "SPLIT" | "AMEND";
};

export function ProposalActions({ changelogId, action }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  function handleAccept() {
    startTransition(async () => {
      setMessage(null);
      const fn = action === "SPLIT" ? acceptSplitProposal : acceptAmendProposal;
      const res = await fn(changelogId);
      if (res.ok) {
        setMessage({ kind: "ok", text: action === "SPLIT" ? `✓ leaf created: ${("newPath" in res) ? res.newPath : ""}` : "✓ change applied" });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      setMessage(null);
      const res = await rejectProposal(changelogId);
      if (res.ok) {
        setMessage({ kind: "ok", text: "✗ rejected" });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={handleAccept}
        disabled={pending}
        className="text-[10px] font-bold bg-[#B2FF59] text-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-[#9ee84a] transition-colors disabled:opacity-50"
      >
        {pending ? "…" : action === "SPLIT" ? "✓ Accept & create" : "✓ Accept change"}
      </button>
      <button
        onClick={handleReject}
        disabled={pending}
        className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/60 px-2.5 py-1 rounded-full uppercase tracking-widest hover:bg-[#E0E0D8] transition-colors disabled:opacity-50"
      >
        {pending ? "…" : "✕ Reject"}
      </button>
      {message && (
        <span className={`text-[10px] font-medium ${message.kind === "ok" ? "text-green-600" : "text-red-500"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}

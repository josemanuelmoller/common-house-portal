"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  agreementId: string;
  version: number;
  agreementType: string;
  canRespond: boolean;
};

export function AgreementResponseActions({ agreementId, version, agreementType, canRespond }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!canRespond) return null;

  const commercial = agreementType === "commercial" || agreementType === "purchase_order";

  async function respond(action: "acknowledge" | "approve" | "request_changes") {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/client-room/agreements/${agreementId}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment, expectedVersion: version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Response failed");
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-2.5">
      <label
        className="block text-[10px] uppercase tracking-[0.08em]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        Optional note
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          className="mt-1.5 block w-full resize-y px-3 py-2 text-[12px] normal-case tracking-normal"
          style={{ border: "1px solid var(--hall-line)", color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-sans)" }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="hall-btn-primary" type="button" disabled={!!busy} onClick={() => respond(commercial ? "approve" : "acknowledge")}>
          {busy ? "Saving…" : commercial ? "Approve →" : "Confirm →"}
        </button>
        <button className="hall-btn-outline" type="button" disabled={!!busy} onClick={() => respond("request_changes")}>
          Request changes
        </button>
      </div>
      {error && <p className="text-[11px]" style={{ color: "var(--hall-danger)" }}>{error}</p>}
    </div>
  );
}

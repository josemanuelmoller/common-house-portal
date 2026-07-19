"use client";

/**
 * RelationalReviewList — ADR-001 human-review queue for ambiguous associations.
 *
 * Each item proposes a canonical `organization_relationships` row derived from a
 * LEGACY signal (relationship_stage, or an org_category that is really a
 * relationship). Nothing is applied automatically — the admin approves or skips.
 * Approving POSTs to the existing relationships API (additive, idempotent).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ReviewProposal = {
  orgId: string;
  orgName: string;
  suggestedType: string;
  reason: string;
  natureNote: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  portfolio: "Portfolio",
  client: "Cliente",
  partner: "Partner",
  vendor: "Proveedor",
  investor: "Inversionista",
  funder: "Funder",
};

export function RelationalReviewList({ proposals }: { proposals: ReviewProposal[] }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = proposals.filter((p) => !dismissed.has(`${p.orgId}:${p.suggestedType}`));

  async function approve(p: ReviewProposal) {
    setBusyId(`${p.orgId}:${p.suggestedType}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${encodeURIComponent(p.orgId)}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relationship_type: p.suggestedType }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  function dismiss(p: ReviewProposal) {
    setDismissed((s) => new Set(s).add(`${p.orgId}:${p.suggestedType}`));
  }

  if (visible.length === 0) {
    return (
      <p className="text-[11.5px] italic" style={{ color: "var(--hall-muted-3)" }}>
        No pending relationship proposals — every legacy signal is already reflected canonically.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-[11px]" style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}>
          {error}
        </p>
      )}
      <ul className="flex flex-col">
        {visible.map((p) => {
          const key = `${p.orgId}:${p.suggestedType}`;
          return (
            <li
              key={key}
              className="flex items-start gap-4 py-3"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                  {p.orgName}
                </p>
                <p className="text-[10.5px] mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
                  {p.reason} → propose{" "}
                  <span style={{ color: "var(--hall-ink-0)", fontWeight: 700 }}>{TYPE_LABEL[p.suggestedType] ?? p.suggestedType}</span>
                </p>
                {p.natureNote && (
                  <p className="text-[10px] mt-0.5 italic" style={{ color: "var(--hall-ink-3)" }}>
                    ⚠ {p.natureNote}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="hall-btn-primary"
                  style={{ padding: "5px 12px", fontSize: 10.5, fontFamily: "var(--font-hall-mono)" }}
                  onClick={() => approve(p)}
                  disabled={busyId === key}
                >
                  {busyId === key ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", borderColor: "var(--hall-line)" }}
                  onClick={() => dismiss(p)}
                  disabled={busyId === key}
                >
                  Skip
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

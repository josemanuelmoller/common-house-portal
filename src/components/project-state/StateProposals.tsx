"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export type ProposalCard = {
  id: string;
  proposalKind: "add_item" | "update_item" | "resolve_item" | "state_summary" | "add_learning";
  itemType: string | null;
  summary: string;
  rationale: string;
  impact: "low" | "medium" | "high" | "critical";
  confidence: number;
  sourceCount: number;
  targetStatement: string | null;
  payloadPreview: string | null;
};

const KIND_LABEL: Record<ProposalCard["proposalKind"], string> = {
  add_item: "New claim",
  update_item: "Update claim",
  resolve_item: "Resolve claim",
  state_summary: "State summary",
  add_learning: "Implementation learning",
};

const meta: CSSProperties = { fontFamily: "var(--font-hall-mono)", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--hall-muted-2)" };

async function api(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function ProposalRow({ projectId, proposal }: { projectId: string; proposal: ProposalCard }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setBusy(action); setError(null);
    try {
      await api(`/api/admin/projects/${projectId}/state/proposals/${proposal.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      setDone(action === "accept" ? "Applied to state" : "Dismissed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  if (done) return <article className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>{done}: {proposal.summary}</p></article>;

  return (
    <article className="py-4" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={proposal.impact === "critical" || proposal.impact === "high" ? "hall-chip-dark" : "hall-chip-outline"}>{proposal.impact}</span>
        <div className="flex-1 min-w-[240px]">
          <p style={meta}>{KIND_LABEL[proposal.proposalKind]}{proposal.itemType ? ` · ${proposal.itemType.replaceAll("_", " ")}` : ""} · {proposal.confidence}% · {proposal.sourceCount} evidence</p>
          <p className="mt-1 text-[13px] font-semibold">{proposal.summary}</p>
          {proposal.targetStatement && <p className="mt-1 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>on: {proposal.targetStatement}</p>}
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{proposal.rationale}</p>
          {proposal.payloadPreview && <p className="mt-1 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>→ {proposal.payloadPreview}</p>}
        </div>
        <div className="flex gap-2">
          <button className="hall-btn-primary" type="button" disabled={!!busy} onClick={() => act("accept")}>{busy === "accept" ? "Applying…" : "Accept →"}</button>
          <button className="hall-btn-ghost" type="button" disabled={!!busy} onClick={() => act("reject")}>Dismiss</button>
        </div>
      </div>
      {error && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-danger)" }}>{error}</p>}
    </article>
  );
}

export function StateProposals({ projectId, proposals }: { projectId: string; proposals: ProposalCard[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function refresh() {
    setRunning(true); setMessage(null); setFailed(false);
    try {
      const body = await api(`/api/admin/projects/${projectId}/state/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const created = body.proposalsCreated ?? 0;
      const considered = body.evidenceConsidered ?? 0;
      setMessage(created > 0
        ? `${created} proposal${created === 1 ? "" : "s"} from ${considered} new evidence item${considered === 1 ? "" : "s"}.`
        : body.skippedReason ? `No proposals: ${body.skippedReason}.` : "No material changes found.");
      router.refresh();
    } catch (err) {
      setFailed(true); setMessage(err instanceof Error ? err.message : String(err));
    } finally { setRunning(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <button className="hall-btn-outline" type="button" disabled={running} onClick={refresh}>{running ? "Reading new evidence…" : "Propose from new evidence"}</button>
        {message && <p className="text-[11px]" style={{ color: failed ? "var(--hall-danger)" : "var(--hall-muted-2)" }}>{message}</p>}
      </div>
      {proposals.length === 0
        ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No pending proposals. Run a refresh to read new validated evidence and propose changes — nothing is applied until you accept it.</p>
        : <div>{proposals.map((p) => <ProposalRow key={p.id} projectId={projectId} proposal={p} />)}</div>}
    </div>
  );
}

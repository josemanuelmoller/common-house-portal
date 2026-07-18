"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { NowProposalPackage, NowProposalCard } from "@/lib/state-proposals";
import type { NowClaim } from "@/lib/operating-signals";

const meta: CSSProperties = { fontFamily: "var(--font-hall-mono)", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--hall-muted-2)" };
const KIND_LABEL: Record<NowProposalCard["kind"], string> = {
  add_item: "New claim", update_item: "Update claim", resolve_item: "Resolve claim",
  state_summary: "State summary", add_learning: "Learning",
};

async function api(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function impactChip(impact: string) {
  return impact === "critical" || impact === "high" ? "hall-chip-dark" : "hall-chip-outline";
}

// ─── Proposal packages ────────────────────────────────────────────────────────

function ProposalCardRow({ projectId, card }: { projectId: string; card: NowProposalCard }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setBusy(action); setError(null);
    try {
      await api(`/api/admin/projects/${projectId}/state/proposals/${card.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      setDone(action === "accept" ? "Applied to state" : "Dismissed");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(null); }
  }

  if (done) return <div className="py-2.5" style={{ borderTop: "1px solid var(--hall-line-soft)" }}><p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>{done}: {card.summary}</p></div>;

  return (
    <div className="py-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={impactChip(card.impact)}>{card.impact}</span>
        <div className="flex-1 min-w-[220px]">
          <p style={meta}>{KIND_LABEL[card.kind]}{card.itemType ? ` · ${card.itemType.replaceAll("_", " ")}` : ""} · {card.confidence}% · {card.sourceCount} evidence</p>
          <p className="mt-1 text-[13px] font-semibold">{card.summary}</p>
          {card.targetStatement && <p className="mt-1 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>on: {card.targetStatement}</p>}
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{card.rationale}</p>
        </div>
        <div className="flex gap-2">
          <button className="hall-btn-primary" type="button" disabled={!!busy} onClick={() => act("accept")}>{busy === "accept" ? "Applying…" : "Accept →"}</button>
          <button className="hall-btn-ghost" type="button" disabled={!!busy} onClick={() => act("reject")}>Dismiss</button>
        </div>
      </div>
      {error && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-danger)" }}>{error}</p>}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: NowProposalPackage }) {
  const [open, setOpen] = useState(false);
  const remaining = pkg.total - pkg.top.length;
  return (
    <article className="py-4" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={impactChip(pkg.maxImpact)}>{pkg.maxImpact}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-[220px] text-left">
          <p className="text-[14px] font-bold">{pkg.total} state {pkg.total === 1 ? "proposal" : "proposals"} to review</p>
          <p style={meta} className="mt-1">{pkg.projectName} · {open ? "collapse" : "expand to decide"}</p>
        </button>
        <Link href={pkg.projectHref} className="hall-btn-ghost">Review all →</Link>
      </div>
      {open && (
        <div className="mt-1">
          {pkg.top.map((card) => <ProposalCardRow key={card.id} projectId={pkg.projectId} card={card} />)}
          {remaining > 0 && <Link href={pkg.projectHref} className="block mt-2 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>+{remaining} more on the project page — Review all →</Link>}
        </div>
      )}
    </article>
  );
}

export function NowProposalPackages({ packages }: { packages: NowProposalPackage[] }) {
  if (packages.length === 0) return null;
  return <div>{packages.map((pkg) => <PackageRow key={pkg.projectId} pkg={pkg} />)}</div>;
}

// ─── Claims (Confirm / Resolve) ───────────────────────────────────────────────

function ClaimRow({ claim }: { claim: NowClaim }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "confirm" | "resolve") {
    setBusy(kind); setError(null);
    const payload = kind === "confirm" ? { status: "active", lastConfirmedAt: new Date().toISOString() } : { status: "resolved" };
    try {
      await api(`/api/admin/projects/${claim.projectId}/state/items/${claim.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setDone(kind === "confirm" ? "Confirmed" : "Resolved");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(null); }
  }

  if (done) return <article className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>{done}: {claim.statement}</p></article>;

  return (
    <article className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={impactChip(claim.urgency)}>{claim.urgency}</span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-[13px] font-semibold">{claim.statement}</p>
          <p style={meta} className="mt-1">{claim.projectName} · {claim.itemType.replaceAll("_", " ")} · due for review</p>
        </div>
        <div className="flex gap-2">
          <button className="hall-btn-ghost" type="button" disabled={!!busy} onClick={() => act("confirm")}>{busy === "confirm" ? "…" : "Confirm"}</button>
          <button className="hall-btn-ghost" type="button" disabled={!!busy} onClick={() => act("resolve")}>Resolve</button>
          <Link href={claim.projectHref} className="hall-btn-ghost">Open</Link>
        </div>
      </div>
      {error && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-danger)" }}>{error}</p>}
    </article>
  );
}

export function NowClaims({ claims }: { claims: NowClaim[] }) {
  if (claims.length === 0) return null;
  return <div>{claims.map((claim) => <ClaimRow key={claim.id} claim={claim} />)}</div>;
}

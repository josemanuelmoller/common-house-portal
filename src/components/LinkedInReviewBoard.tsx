"use client";

/**
 * LinkedInReviewBoard — the client half of /admin/hall/linkedin-review.
 *
 * Shows each contact flagged with linkedin_needs_review=true. For each, the
 * reviewer can:
 *   - ✓ Approve  → keeps the candidate URL, clears the review flag
 *   - ✗ Reject   → drops the URL, puts the contact into cooldown
 *   - ✎ Override → paste a different linkedin.com/in/… url manually
 *
 * Also exposes a "Run agent" button that triggers POST /api/linkedin-enrichment/run
 * (dry_run first so the user sees what's about to happen, then execute on
 * confirmation).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id:                   string;
  email:                string | null;
  full_name:            string | null;
  display_name:         string | null;
  linkedin:             string | null;
  linkedin_confidence:  number | null;
  linkedin_source:      string | null;
  linkedin_enriched_at: string | null;
  relationship_classes: string[] | null;
  meeting_count:        number | null;
};

type RunSummary = {
  processed:     number;
  auto_applied:  number;
  queued_review: number;
  no_match:      number;
  errors:        number;
  skipped:       number;
};

export function LinkedInReviewBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function runAgent(limit = 25) {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/linkedin-enrichment/run?limit=${limit}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "run failed");
      setLastRun(json.summary as RunSummary);
      startTransition(() => router.refresh());
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Run-agent controls */}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-[#131218]">Run enrichment now</p>
          <p className="text-[10.5px] text-[#131218]/50 mt-0.5">
            Scans contacts without a LinkedIn URL, searches Google Custom Search, and asks Haiku to confirm.
            Cooldown: 14 days between attempts per contact.
          </p>
        </div>
        <button
          onClick={() => runAgent(10)}
          disabled={running || pending}
          className="text-[10px] font-bold uppercase tracking-widest border border-[#131218]/20 text-[#131218] hover:border-[#131218]/50 px-3 py-2 rounded-lg disabled:opacity-40"
        >
          Run 10
        </button>
        <button
          onClick={() => runAgent(25)}
          disabled={running || pending}
          className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
        >
          {running ? "Running…" : "Run 25"}
        </button>
      </div>

      {runError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[11px] text-red-700">
          {runError}
        </div>
      )}

      {lastRun && (
        <div className="bg-[#131218] text-white rounded-2xl px-5 py-4">
          <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-2">Last run</p>
          <div className="flex items-center gap-6 text-[12px]">
            <span>Processed <strong>{lastRun.processed}</strong></span>
            <span className="text-[#c8f55a]">Auto-applied <strong>{lastRun.auto_applied}</strong></span>
            <span className="text-amber-300">Review <strong>{lastRun.queued_review}</strong></span>
            <span className="text-white/50">No match <strong>{lastRun.no_match}</strong></span>
            {lastRun.errors > 0 && <span className="text-red-400">Errors <strong>{lastRun.errors}</strong></span>}
          </div>
        </div>
      )}

      {/* Review queue */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Needs review</h2>
          <div className="flex-1 h-px bg-[#E0E0D8]" />
          <span className="text-[10px] text-[#131218]/40 tabular-nums">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-10 text-center">
            <p className="text-[12px] text-[#131218]/40">
              Nothing to review. Run the agent above to look up LinkedIn profiles for your queued contacts.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => <ReviewRow key={r.id} row={r} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewRow({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overriding, setOverriding] = useState(false);
  const [overrideUrl, setOverrideUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const display = row.full_name ?? row.display_name ?? (row.email ?? "").split("@")[0] ?? "(no name)";
  const classes = row.relationship_classes ?? [];
  const conf = row.linkedin_confidence ?? 0;
  const confTier = conf >= 0.7 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                 : conf >= 0.5 ? "text-amber-700  bg-amber-50  border-amber-200"
                 :               "text-red-700    bg-red-50    border-red-200";

  async function act(action: "approve" | "reject" | "override", url?: string) {
    setError(null);
    try {
      const res = await fetch("/api/linkedin-enrichment/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ person_id: row.id, action, url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "review failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#131218] text-white flex items-center justify-center flex-shrink-0 font-bold text-sm">
          {display.slice(0, 1).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-[13px] font-semibold text-[#131218]">{display}</p>
            <p className="text-[10.5px] text-[#131218]/45">{row.email}</p>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${confTier}`}>
              {Math.round(conf * 100)}% match
            </span>
            {classes.map(cls => (
              <span key={cls} className="text-[9px] font-bold uppercase tracking-widest bg-[#EFEFEA] text-[#131218]/60 px-2 py-0.5 rounded-full">
                {cls}
              </span>
            ))}
          </div>

          {row.linkedin && (
            <a
              href={row.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-[11.5px] text-[#131218] underline decoration-[#131218]/30 underline-offset-2 hover:decoration-[#131218]/70 break-all"
            >
              {row.linkedin}
            </a>
          )}

          {error && (
            <p className="mt-2 text-[10.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              {error}
            </p>
          )}

          {overriding && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="url"
                value={overrideUrl}
                onChange={e => setOverrideUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/…"
                className="flex-1 text-[12px] px-3 py-1.5 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
              />
              <button
                onClick={() => { act("override", overrideUrl); setOverriding(false); setOverrideUrl(""); }}
                disabled={!overrideUrl || pending}
                className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setOverriding(false); setOverrideUrl(""); }}
                className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/50 hover:text-[#131218] px-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!overriding && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => act("approve")}
              disabled={pending}
              className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-3 py-1.5 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setOverriding(true)}
              disabled={pending}
              className="text-[10px] font-bold uppercase tracking-widest border border-[#131218]/20 text-[#131218] hover:border-[#131218]/50 px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              ✎ Override
            </button>
            <button
              onClick={() => act("reject")}
              disabled={pending}
              className="text-[10px] font-bold uppercase tracking-widest border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  job_title:            string | null;
  role_category:        string | null;
  function_area:        string | null;
};

const ROLE_CATEGORIES = ["Founder", "Executive", "Manager", "IC", "Investor", "Advisor", "Other"] as const;
const FUNCTION_AREAS  = [
  "Marketing", "Sales", "Product", "Engineering", "Design",
  "Operations", "Finance", "People", "Legal", "Strategy",
  "Sustainability", "Data", "General", "Research", "CustomerSuccess", "Other",
] as const;

type RunSummary = {
  processed:     number;
  auto_applied:  number;
  queued_review: number;
  no_match:      number;
  errors:        number;
  skipped:       number;
};

export type LinkedInCoverage = {
  total:        number;   // addressable contacts (has email + not dismissed)
  filled:       number;   // have a LinkedIn URL
  manual:       number;   // filled, source=manual
  auto:         number;   // filled, source=agent
  needs_review: number;   // flagged for human
  attempted:    number;   // agent has tried (enriched OR filed no_match)
};

export function LinkedInReviewBoard({ rows, coverage }: { rows: Row[]; coverage?: LinkedInCoverage }) {
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
            Cooldown: 6 months between attempts per contact (LinkedIn profiles rarely change).
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

      {coverage && coverage.total > 0 && (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/45">Coverage</p>
            <p className="text-[11px] text-[#131218]/60 tabular-nums">
              <strong className="text-[#131218]">{coverage.filled}</strong>
              <span className="text-[#131218]/40"> / {coverage.total} contacts</span>
              <span className="text-[#131218]/40 ml-2">· </span>
              <strong className="text-[#131218]">{Math.round((coverage.filled / coverage.total) * 100)}%</strong>
            </p>
          </div>
          <div className="h-2 w-full bg-[#EFEFEA] rounded-full overflow-hidden flex">
            {coverage.auto > 0 && (
              <div
                className="h-full bg-[#c8f55a]"
                style={{ width: `${(coverage.auto / coverage.total) * 100}%` }}
                title={`${coverage.auto} auto-applied`}
              />
            )}
            {coverage.manual > 0 && (
              <div
                className="h-full bg-[#131218]"
                style={{ width: `${(coverage.manual / coverage.total) * 100}%` }}
                title={`${coverage.manual} manual`}
              />
            )}
            {coverage.needs_review > 0 && (
              <div
                className="h-full bg-amber-400"
                style={{ width: `${(coverage.needs_review / coverage.total) * 100}%` }}
                title={`${coverage.needs_review} need review`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-[#131218]/55">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#c8f55a]" /> Auto · <strong>{coverage.auto}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#131218]" /> Manual · <strong>{coverage.manual}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Needs review · <strong>{coverage.needs_review}</strong>
            </span>
            <span className="ml-auto text-[#131218]/40">
              {coverage.attempted - coverage.filled} tried but no match ·{" "}
              {coverage.total - coverage.attempted} not yet attempted
            </span>
          </div>
        </div>
      )}

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

  // Role fields are editable inline. Seed from the agent's current proposal.
  const [editingRole, setEditingRole] = useState(false);
  const [jobTitle, setJobTitle]           = useState(row.job_title      ?? "");
  const [roleCategory, setRoleCategory]   = useState(row.role_category  ?? "");
  const [functionArea, setFunctionArea]   = useState(row.function_area  ?? "");

  const display = row.full_name ?? row.display_name ?? (row.email ?? "").split("@")[0] ?? "(no name)";
  const classes = row.relationship_classes ?? [];
  const conf = row.linkedin_confidence ?? 0;
  const confTier = conf >= 0.7 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                 : conf >= 0.5 ? "text-amber-700  bg-amber-50  border-amber-200"
                 :               "text-red-700    bg-red-50    border-red-200";

  async function act(action: "approve" | "reject" | "override", url?: string) {
    setError(null);
    try {
      const payload: Record<string, string | null | undefined> = { person_id: row.id, action };
      if (action === "override") payload.url = url;
      // Approve + Override both carry whatever the reviewer currently has in
      // the role fields. If the reviewer hasn't touched them, we still send
      // through the current values so the agent proposal is locked in as
      // manual (not re-overwritable by the next run).
      if (action !== "reject") {
        payload.job_title     = jobTitle.trim()    || null;
        payload.role_category = roleCategory       || null;
        payload.function_area = functionArea       || null;
      }
      const res = await fetch("/api/linkedin-enrichment/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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

          {/* Role proposal — shown compact, editable inline */}
          <div className="mt-2">
            {!editingRole ? (
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                {jobTitle ? (
                  <span className="text-[#131218]">{jobTitle}</span>
                ) : (
                  <span className="text-[#131218]/30 italic">no title extracted</span>
                )}
                {roleCategory && (
                  <span className="text-[9px] font-bold uppercase tracking-widest bg-[#EFEFEA] text-[#131218]/70 px-2 py-0.5 rounded-full">
                    {roleCategory}
                  </span>
                )}
                {functionArea && (
                  <span className="text-[9px] font-bold uppercase tracking-widest bg-[#c8f55a]/30 text-[#131218]/80 px-2 py-0.5 rounded-full">
                    {functionArea}
                  </span>
                )}
                <button
                  onClick={() => setEditingRole(true)}
                  disabled={pending}
                  className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218] underline decoration-dotted"
                >
                  edit
                </button>
              </div>
            ) : (
              <div className="mt-1 grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="Job title"
                  className="text-[11px] px-2 py-1 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
                />
                <select
                  value={roleCategory}
                  onChange={e => setRoleCategory(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
                >
                  <option value="">— tier —</option>
                  {ROLE_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select
                  value={functionArea}
                  onChange={e => setFunctionArea(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
                >
                  <option value="">— area —</option>
                  {FUNCTION_AREAS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <button
                  onClick={() => setEditingRole(false)}
                  className="col-span-3 text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 hover:text-[#131218] underline decoration-dotted justify-self-start"
                >
                  done editing
                </button>
              </div>
            )}
          </div>

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

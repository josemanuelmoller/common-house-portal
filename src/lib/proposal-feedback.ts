/**
 * proposal-feedback.ts
 *
 * The READ side of the feedback loop. Where proposal-outcomes.ts *captures*
 * José's decisions (approve / edit / reject), this reads them back so a
 * generation skill can learn from its own past mistakes BEFORE drafting again.
 *
 * Returns a compact, prompt-injectable block:
 *   - REJECTED items → what to avoid (with the reason José gave)
 *   - EDITED items   → how he rewrites our output (before → after), so the
 *     model can match that style preemptively instead of making us fix it.
 *
 * Returns "" when there is no feedback yet, so prompts are unchanged until real
 * signal exists — no speculative noise. Defensive by design: any failure yields
 * "" and never blocks generation.
 */

import { getSupabaseServerClient } from "./supabase-server";
import type { ProposalType } from "./proposal-outcomes";

type FeedbackRow = {
  action: string;
  proposal_title: string | null;
  reason: string | null;
  edit_summary: string | null;
  metadata: { old_body?: string; new_body?: string } | null;
};

function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export async function getProposalFeedbackContext(opts: {
  proposalType: ProposalType;
  /** Filter to one generator (proposal_outcomes.agent_name). Omit for all. */
  agentName?: string | null;
  /** Max feedback items to include. */
  limit?: number;
  /** Only consider decisions newer than this many days. */
  windowDays?: number;
}): Promise<string> {
  const limit = opts.limit ?? 6;
  const windowDays = opts.windowDays ?? 180;

  try {
    const sb = getSupabaseServerClient();
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    let q = sb
      .from("proposal_outcomes")
      .select("action, proposal_title, reason, edit_summary, metadata")
      .eq("proposal_type", opts.proposalType)
      // Only the corrective signals teach us anything; approvals/sends don't.
      .in("action", ["rejected", "revision_requested", "edited"])
      .gte("decided_at", since)
      .order("decided_at", { ascending: false })
      .limit(limit);

    if (opts.agentName) q = q.eq("agent_name", opts.agentName);

    const { data, error } = await q;
    if (error || !data || data.length === 0) return "";

    const rows = data as FeedbackRow[];
    const lines: string[] = [];
    for (const r of rows) {
      const title = clip(r.proposal_title, 80) || "(untitled)";
      if (r.action === "rejected" || r.action === "revision_requested") {
        const why = clip(r.reason, 160);
        lines.push(`- REJECTED "${title}"${why ? ` — reason: ${why}` : " (no reason given)"}`);
      } else if (r.action === "edited") {
        const before = clip(r.metadata?.old_body, 200);
        const after = clip(r.metadata?.new_body, 200);
        if (before && after) {
          lines.push(`- EDITED "${title}": José rewrote\n    before: "${before}"\n    after:  "${after}"`);
        } else {
          lines.push(`- EDITED "${title}"${r.edit_summary ? ` (${clip(r.edit_summary, 60)})` : ""}`);
        }
      }
    }
    if (lines.length === 0) return "";

    return [
      "## Past human feedback on output like this — learn from it, do not repeat these mistakes",
      "These are recent decisions José made on similar proposals. Rejections show what to avoid;",
      "edits show how he rewrites this kind of output — match that style preemptively.",
      "",
      ...lines,
      "",
    ].join("\n");
  } catch {
    return "";
  }
}

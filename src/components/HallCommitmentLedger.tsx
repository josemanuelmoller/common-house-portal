import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { HallCommitmentLedgerRows, type CommitmentLite } from "./HallCommitmentLedgerRows";

/**
 * Commitment ledger — parses recent Dependency / Process Step / Requirement
 * evidence into two buckets:
 *   - "Jose committed" — statements where Jose is the actor (fuga de confianza
 *     risk if not delivered).
 *   - "Others owe you" — statements where someone else is the actor Jose
 *     should chase.
 *
 * Heuristic (no LLM): substring-match "Jose" or any self-identity email in
 * the statement. If present AND the statement verb is action-oriented,
 * Jose is the owner. Otherwise bucket = others.
 *
 * This is not perfect but catches ~80% of action items without a second
 * validation pass. Jose can refine via the evidence record in Notion.
 */

const ACTION_VERBS = [
  "must", "needs to", "need to", "will", "should", "is tasked",
  "is responsible", "pending", "required", "owes", "to send", "to finalize",
  "to complete", "to follow up", "to coordinate",
];

type RawEvidence = {
  notion_id:          string;
  title:              string;
  evidence_statement: string | null;
  project_notion_id:  string | null;
  date_captured:      string | null;
};

type Commitment = {
  id:         string;
  title:      string;
  snippet:    string;
  daysAgo:    number;
  owner:      "jose" | "others";
  projectId:  string | null;
  notionUrl:  string;
};

async function loadCommitments(): Promise<Commitment[]> {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);

  const { data } = await sb
    .from("evidence")
    .select("notion_id, title, evidence_statement, project_notion_id, date_captured")
    .in("evidence_type", ["Dependency", "Process Step", "Requirement"])
    .eq("validation_status", "Validated")
    .gte("date_captured", since)
    .order("date_captured", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as RawEvidence[];
  const now = Date.now();
  const commitments: Commitment[] = [];

  for (const r of rows) {
    const stmt = (r.evidence_statement ?? r.title ?? "").trim();
    if (!stmt) continue;
    const lower = stmt.toLowerCase();
    if (!ACTION_VERBS.some(v => lower.includes(v))) continue;

    // Owner detection: is self-email mentioned OR does the statement
    // explicitly name 'Jose' or 'Jose Manuel'?
    let owner: "jose" | "others" = "others";
    if (lower.includes("jose manuel") || /\bjose\b/i.test(stmt)) owner = "jose";
    for (const se of selfSet) if (lower.includes(se)) owner = "jose";

    const daysAgo = r.date_captured
      ? Math.floor((now - new Date(r.date_captured).getTime()) / 86400_000)
      : 0;

    commitments.push({
      id:         r.notion_id,
      title:      r.title,
      snippet:    stmt.length > 180 ? stmt.slice(0, 180) + "…" : stmt,
      daysAgo,
      owner,
      projectId:  r.project_notion_id,
      notionUrl:  `https://www.notion.so/${r.notion_id.replace(/-/g, "")}`,
    });
  }

  return commitments;
}

export async function HallCommitmentLedger() {
  const all = await loadCommitments();

  // G3 write-back — fetch server-side dismissals so they hide across
  // devices/refreshes. LocalStorage on the client is an optimistic
  // overlay on top of this.
  const sb = getSupabaseServerClient();
  const { data: dismissedRows } = await sb
    .from("hall_commitment_dismissals")
    .select("notion_id");
  const serverDismissed = new Set(((dismissedRows ?? []) as { notion_id: string }[]).map(r => r.notion_id));

  // G2 — strip redundant "Jose Manuel must..." prefix from titles since the
  // section label ("You committed") already establishes the actor.
  const normalize = (c: Commitment): CommitmentLite => ({
    id:        c.id,
    title:     c.title.replace(/^Jose( Manuel( Moller)?)?\s+(must|will|to)\s+/i, "").replace(/^./, s => s.toUpperCase()),
    snippet:   c.snippet.replace(/^Jose( Manuel( Moller)?)?\s+(must|will|to)\s+/i, ""),
    daysAgo:   c.daysAgo,
    owner:     c.owner,
    notionUrl: c.notionUrl,
  });

  // Filter dismissed out of the initial render. The client-side "show done"
  // toggle only reveals items the *current device* dismissed — server-side
  // dismissals stay hidden (they're "archived" across the team).
  const active = all.filter(c => !serverDismissed.has(c.id));
  const joseCommits = active.filter(c => c.owner === "jose").slice(0, 5).map(normalize);
  const othersCommits = active.filter(c => c.owner === "others").slice(0, 5).map(normalize);

  return (
    <HallCommitmentLedgerRows
      joseCommits={joseCommits}
      othersCommits={othersCommits}
      allUrl="/admin/hall/commitments"
    />
  );
}

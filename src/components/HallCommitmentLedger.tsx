import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

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
  const joseCommits = all.filter(c => c.owner === "jose").slice(0, 5);
  const othersCommits = all.filter(c => c.owner === "others").slice(0, 5);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Commitments</span>
          {joseCommits.length > 0 && (
            <span className="text-[9px] font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
              {joseCommits.length} you owe
            </span>
          )}
          {othersCommits.length > 0 && (
            <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/60 px-1.5 py-0.5 rounded-full">
              {othersCommits.length} owed to you
            </span>
          )}
        </div>
        <Link href="/admin/hall/commitments" className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80">
          All →
        </Link>
      </div>

      {all.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[11px] text-[#131218]/35">No open action items from the last 60 days.</p>
        </div>
      ) : (
        <>
          {joseCommits.length > 0 && (
            <div className="px-5 pt-3 pb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-700/80 mb-1">You committed</p>
            </div>
          )}
          {joseCommits.map(c => <Row key={c.id} c={c} kind="jose" />)}

          {othersCommits.length > 0 && (
            <div className="px-5 pt-3 pb-1 border-t border-[#EFEFEA]">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 mb-1">Owed to you</p>
            </div>
          )}
          {othersCommits.map(c => <Row key={c.id} c={c} kind="others" />)}
        </>
      )}
    </div>
  );
}

function Row({ c, kind }: { c: Commitment; kind: "jose" | "others" }) {
  const stale = c.daysAgo >= 21 ? "text-red-600" : c.daysAgo >= 10 ? "text-amber-700" : "text-[#131218]/50";
  const borderColor = kind === "jose" ? "border-l-[3px] border-red-400" : "border-l-[3px] border-[#131218]/10";
  return (
    <a
      href={c.notionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-start gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors ${borderColor}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-[#131218] line-clamp-1">{c.title}</p>
        <p className="text-[9px] text-[#131218]/55 mt-0.5 line-clamp-2">{c.snippet}</p>
      </div>
      <span className={`text-[10px] font-bold shrink-0 ${stale}`}>
        {c.daysAgo}d
      </span>
    </a>
  );
}

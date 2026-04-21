import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

export const dynamic = "force-dynamic";

const ACTION_VERBS = [
  "must", "needs to", "need to", "will", "should", "is tasked",
  "is responsible", "pending", "required", "owes", "to send", "to finalize",
  "to complete", "to follow up", "to coordinate",
];

type Commitment = {
  id:         string;
  title:      string;
  statement:  string;
  daysAgo:    number;
  owner:      "jose" | "others";
  projectId:  string | null;
  evidenceType: string;
  dateCaptured: string;
};

async function load(): Promise<Commitment[]> {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

  const { data } = await sb
    .from("evidence")
    .select("notion_id, title, evidence_statement, evidence_type, project_notion_id, date_captured")
    .in("evidence_type", ["Dependency", "Process Step", "Requirement"])
    .eq("validation_status", "Validated")
    .gte("date_captured", since)
    .order("date_captured", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as {
    notion_id: string; title: string; evidence_statement: string | null;
    evidence_type: string; project_notion_id: string | null; date_captured: string | null;
  }[];

  const out: Commitment[] = [];
  const now = Date.now();
  for (const r of rows) {
    const stmt = (r.evidence_statement ?? r.title).trim();
    if (!stmt) continue;
    const lower = stmt.toLowerCase();
    if (!ACTION_VERBS.some(v => lower.includes(v))) continue;

    let owner: "jose" | "others" = "others";
    if (lower.includes("jose manuel") || /\bjose\b/i.test(stmt)) owner = "jose";
    for (const se of selfSet) if (lower.includes(se)) owner = "jose";

    const daysAgo = r.date_captured ? Math.floor((now - new Date(r.date_captured).getTime()) / 86400_000) : 0;
    out.push({
      id:           r.notion_id,
      title:        r.title,
      statement:    stmt,
      daysAgo,
      owner,
      projectId:    r.project_notion_id,
      evidenceType: r.evidence_type,
      dateCaptured: r.date_captured ?? "",
    });
  }
  return out;
}

export default async function CommitmentsPage() {
  await requireAdmin();
  const all = await load();
  const jose   = all.filter(c => c.owner === "jose");
  const others = all.filter(c => c.owner === "others");
  const stale  = all.filter(c => c.daysAgo >= 14);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Hall · Accountability</p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commitment <em className="font-black italic text-[#c8f55a]">Ledger</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                Action items parsed from validated evidence in CH Evidence [OS v2], last 90 days. Heuristic-based — click into any record to refine, dismiss, or close.
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="You owe"    value={jose.length}   color="text-red-400" />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Owed to you" value={others.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label=">14 days stale" value={stale.length} color={stale.length > 0 ? "text-amber-400" : "text-white/30"} />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-3.5">
            <p className="text-[11px] text-[#131218]/60 leading-snug">
              <strong className="text-[#131218]">Ledger rules.</strong>{" "}
              A commitment is Dependency / Process Step / Requirement evidence with an action verb in the statement. Owner = Jose if the statement mentions his name or email; otherwise it lives under "Owed to you". No auto-completion yet — refine in Notion when done.
            </p>
          </div>

          <Section title="You committed" items={jose} kind="jose" empty="Nothing on your side — clean slate." />
          <Section title="Owed to you"   items={others} kind="others" empty="No outstanding pings on others." />
        </div>
      </main>
    </div>
  );
}

function Section({ title, items, kind, empty }: { title: string; items: Commitment[]; kind: "jose" | "others"; empty: string }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">{title}</h2>
        <div className="flex-1 h-px bg-[#E0E0D8]" />
        <span className="text-[10px] font-semibold text-[#131218]/30">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-6 text-center">
          <p className="text-[11px] text-[#131218]/35">{empty}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
          {items.map(c => <Row key={c.id} c={c} kind={kind} />)}
        </div>
      )}
    </section>
  );
}

function Row({ c, kind }: { c: Commitment; kind: "jose" | "others" }) {
  const stale = c.daysAgo >= 21 ? "text-red-600" : c.daysAgo >= 10 ? "text-amber-700" : "text-[#131218]/55";
  const border = kind === "jose" ? "border-l-[3px] border-red-400" : "border-l-[3px] border-[#131218]/10";
  return (
    <Link
      href={`https://www.notion.so/${c.id.replace(/-/g, "")}`}
      target="_blank"
      className={`flex items-start gap-3 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors ${border}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[12px] font-bold text-[#131218] line-clamp-1">{c.title}</p>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#131218]/6 text-[#131218]/55 uppercase tracking-wide shrink-0">
            {c.evidenceType}
          </span>
        </div>
        <p className="text-[10px] text-[#131218]/60 leading-relaxed line-clamp-3">{c.statement}</p>
      </div>
      <span className={`text-[11px] font-bold shrink-0 ${stale}`}>
        {c.daysAgo}d
      </span>
    </Link>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-right">
      <p className={`text-[2rem] font-black tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">{label}</p>
    </div>
  );
}

import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { approveOrphanCandidate, rejectOrphanCandidate, triggerOrphanScan } from "./actions";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id:                   string;
  source_id:            string;
  sender_name:          string;
  candidate_person_id:  string;
  candidate_reason:     string;
  confidence:           number;
  msg_count:            number;
  status:               string;
  created_at:           string;
};

type PersonLite = { id: string; full_name: string | null; email: string | null };
type SourceLite = { id: string; title: string; notion_id: string | null; source_platform: string | null };

async function loadData() {
  const sb = getSupabaseServerClient();

  const { data: pending } = await sb
    .from("orphan_match_candidates")
    .select("id, source_id, sender_name, candidate_person_id, candidate_reason, confidence, msg_count, status, created_at")
    .eq("status", "pending")
    .order("confidence", { ascending: false })
    .order("msg_count",  { ascending: false });

  const rows = (pending ?? []) as CandidateRow[];
  const personIds  = [...new Set(rows.map(r => r.candidate_person_id))];
  const sourceIds  = [...new Set(rows.map(r => r.source_id))];

  const [peopleRes, sourcesRes] = await Promise.all([
    personIds.length > 0
      ? sb.from("people").select("id, full_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as PersonLite[] }),
    sourceIds.length > 0
      ? sb.from("sources").select("id, title, notion_id, source_platform").in("id", sourceIds)
      : Promise.resolve({ data: [] as SourceLite[] }),
  ]);

  const people  = new Map<string, PersonLite>();
  for (const p of (peopleRes.data ?? []) as PersonLite[]) people.set(p.id, p);
  const sources = new Map<string, SourceLite>();
  for (const s of (sourcesRes.data ?? []) as SourceLite[]) sources.set(s.id, s);

  // Stats for header
  const { count: pendingCount }  = await sb.from("orphan_match_candidates").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { count: approvedCount } = await sb.from("orphan_match_candidates").select("*", { count: "exact", head: true }).eq("status", "approved");
  const { count: rejectedCount } = await sb.from("orphan_match_candidates").select("*", { count: "exact", head: true }).eq("status", "rejected");
  const { count: remainingOrphans } = await sb
    .from("conversation_messages")
    .select("*", { count: "exact", head: true })
    .is("sender_person_id", null)
    .eq("sender_is_self", false);

  return {
    rows,
    people,
    sources,
    stats: {
      pending:  pendingCount ?? 0,
      approved: approvedCount ?? 0,
      rejected: rejectedCount ?? 0,
      remainingOrphans: remainingOrphans ?? 0,
    },
  };
}

async function approveAction(formData: FormData) {
  "use server";
  const id = formData.get("id");
  if (typeof id === "string") await approveOrphanCandidate(id);
}
async function rejectAction(formData: FormData) {
  "use server";
  const id = formData.get("id");
  if (typeof id === "string") await rejectOrphanCandidate(id);
}
async function rescanAction() {
  "use server";
  await triggerOrphanScan();
}

export default async function OrphansPage() {
  await requireAdmin();
  const { rows, people, sources, stats } = await loadData();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
            <Link href="/admin/hall/contacts" className="hover:text-white/80 transition-colors">Hall</Link>
            <span>›</span>
            <span className="text-white/50">Orphan matches</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Orphan <em className="font-black italic text-[#c8f55a]">matches</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                Medium-confidence sender matches that the clipper surfaced for
                your review. <strong className="text-white/70">Approving teaches
                the system</strong> — the sender name is added as an alias on
                the Person, so the next clip resolves at higher confidence and
                skips this review entirely.
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Pending"   value={stats.pending} color={stats.pending > 0 ? "text-[#c8f55a]" : "text-white/30"} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Approved"  value={stats.approved} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Rejected"  value={stats.rejected} color="text-white/40" />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Orphan msgs" value={stats.remainingOrphans} color={stats.remainingOrphans > 0 ? "text-amber-400" : "text-white/30"} />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-[11px] text-[#131218]/60 leading-snug max-w-3xl">
                <strong>Approve</strong> = apply the match + save <em>{`"sender name"`}</em>{" "}
                as an alias on the Person. Next clip auto-links at higher confidence.{" "}
                <strong>Reject</strong> = revert the optimistic link + don&apos;t learn.{" "}
                <strong>Re-scan</strong> scans all{" "}
                <code className="text-[10px] bg-white px-1 rounded border border-[#E0E0D8]">sender_person_id=null</code>{" "}
                rows and files new candidates.
              </p>
            </div>
            <form action={rescanAction}>
              <button
                type="submit"
                className="bg-[#131218] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-[#2a2a2d] transition-colors whitespace-nowrap"
              >
                Re-scan orphans
              </button>
            </form>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-10 text-center">
              <p className="text-sm text-[#131218]/50">
                No pending candidates. {stats.remainingOrphans > 0 ? "Try Re-scan to look for new matches." : "Nothing left to review."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {rows.map(r => {
                const person = people.get(r.candidate_person_id);
                const source = sources.get(r.source_id);
                const confPct = Math.round(r.confidence * 100);
                const confColor = r.confidence >= 0.85 ? "bg-[#22c55e]" : r.confidence >= 0.65 ? "bg-[#f59e0b]" : "bg-[#9ca3af]";
                return (
                  <div key={r.id} className="px-5 py-4 hover:bg-[#EFEFEA]/40 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[13px] font-bold text-[#131218]">
                            &ldquo;{r.sender_name}&rdquo;
                          </span>
                          <span className="text-[11px] text-[#131218]/40">→</span>
                          <span className="text-[13px] font-bold text-[#131218]">
                            {person?.full_name ?? "(person not found)"}
                          </span>
                          {person?.email && (
                            <span className="text-[10px] text-[#131218]/45">· {person.email}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[#131218]/55">
                          <span className="uppercase tracking-wide font-bold">{r.candidate_reason.replace(/_/g, " ")}</span>
                          <span>·</span>
                          <span>{r.msg_count} message{r.msg_count === 1 ? "" : "s"}</span>
                          <span>·</span>
                          <span className="min-w-[90px] flex items-center gap-2">
                            <span className="flex-1 h-1 rounded-full bg-[#EFEFEA] overflow-hidden inline-block max-w-[60px]">
                              <span className={`block h-full ${confColor}`} style={{ width: `${confPct}%` }} />
                            </span>
                            <span className="font-bold tracking-wider">{confPct}%</span>
                          </span>
                          {source?.title && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[240px]">{source.title}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <form action={approveAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="bg-[#c8f55a] text-[#131218] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded hover:bg-[#d4ff6a] transition-colors"
                            title={`Backfill ${r.msg_count} messages → ${person?.full_name ?? r.candidate_person_id}`}
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="bg-white text-[#131218]/60 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-[#E0E0D8] hover:bg-[#EFEFEA]/60 transition-colors"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
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

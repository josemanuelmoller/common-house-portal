import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  approveOrphanCandidate,
  rejectOrphanCandidate,
  triggerOrphanScan,
} from "@/app/admin/hall/orphans/actions";

/**
 * Server component — renders the orphan candidates review queue. Used as a
 * tab inside /admin/hall/contacts so the reviewer doesn't have to switch
 * pages. Extracts the same content that lives on /admin/hall/orphans.
 */

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

  const { count: remainingOrphans } = await sb
    .from("conversation_messages")
    .select("*", { count: "exact", head: true })
    .is("sender_person_id", null)
    .eq("sender_is_self", false);

  return { rows, people, sources, remainingOrphans: remainingOrphans ?? 0 };
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

export async function OrphansReviewSection() {
  const { rows, people, sources, remainingOrphans } = await loadData();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <p className="text-[11px] text-[#131218]/60 leading-snug max-w-3xl">
            Medium-confidence sender matches from the clipper. <strong>Approve</strong> = apply the match + save the sender name as an alias on the Person so next clip auto-links. <strong>Reject</strong> = revert optimistic link + don&apos;t learn. <strong>Re-scan</strong> looks through every{" "}
            <code className="text-[10px] bg-white px-1 rounded border border-[#E0E0D8]">sender_person_id=null</code> row for new matches.
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
            No pending candidates. {remainingOrphans > 0 ? "Try Re-scan to look for new matches." : "Nothing left to review."}
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
  );
}

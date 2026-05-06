import { getSupabaseServerClient } from "@/lib/supabase-server";
import { triggerOrphanScan } from "@/app/admin/hall/orphans/actions";
import { OrphanCandidateRow } from "./OrphanCandidateRow";

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
          <p className="text-[11px] text-[#0a0a0a]/60 leading-snug max-w-3xl">
            Medium-confidence sender matches from the clipper. <strong>Approve</strong> = apply the match + save the sender name as an alias on the Person so next clip auto-links. <strong>Reject</strong> = revert optimistic link + don&apos;t learn. <strong>Re-scan</strong> looks through every{" "}
            <code className="text-[10px] bg-white px-1 rounded border border-[#e4e4dd]">sender_person_id=null</code> row for new matches.
          </p>
        </div>
        <form action={rescanAction}>
          <button
            type="submit"
            className="bg-[#0a0a0a] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-[#2a2a2d] transition-colors whitespace-nowrap"
          >
            Re-scan orphans
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e4e4dd] px-5 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/50">
            No pending candidates. {remainingOrphans > 0 ? "Try Re-scan to look for new matches." : "Nothing left to review."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden divide-y divide-[#f4f4ef]">
          {rows.map(r => {
            const person = people.get(r.candidate_person_id);
            const source = sources.get(r.source_id);
            const confPct = Math.round(r.confidence * 100);
            const confColor = r.confidence >= 0.85 ? "bg-[#22c55e]" : r.confidence >= 0.65 ? "bg-[#f59e0b]" : "bg-[#9ca3af]";
            return (
              <OrphanCandidateRow
                key={r.id}
                candidateId={r.id}
                senderName={r.sender_name}
                personName={person?.full_name ?? null}
                personEmail={person?.email ?? null}
                reasonLabel={r.candidate_reason.replace(/_/g, " ")}
                msgCount={r.msg_count}
                confPct={confPct}
                confColor={confColor}
                sourceTitle={source?.title ?? null}
                msgBackfillHint={`Backfill ${r.msg_count} messages → ${person?.full_name ?? r.candidate_person_id}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

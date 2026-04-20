import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { HallContactRow } from "@/components/HallContactRow";

export const dynamic = "force-dynamic";

type ContactRow = {
  email: string;
  display_name: string | null;
  relationship_class: string | null;
  auto_suggested: string | null;
  last_meeting_title: string | null;
  meeting_count: number;
  last_seen_at: string;
  first_seen_at: string;
  classified_at: string | null;
  classified_by: string | null;
  google_resource_name: string | null;
  google_source: string | null;
  google_labels: string[] | null;
  google_synced_at: string | null;
  google_last_write_at: string | null;
};

async function getContacts(): Promise<ContactRow[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_attendees")
    .select("email, display_name, relationship_class, auto_suggested, last_meeting_title, meeting_count, last_seen_at, first_seen_at, classified_at, classified_by, google_resource_name, google_source, google_labels, google_synced_at, google_last_write_at")
    .gte("last_seen_at", new Date(Date.now() - 120 * 86400_000).toISOString())
    .order("meeting_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(200);
  return (data ?? []) as ContactRow[];
}

export default async function HallContactsPage() {
  await requireAdmin();
  const contacts = await getContacts();

  const unclassified = contacts.filter(c => !c.relationship_class);
  const classified   = contacts.filter(c =>  c.relationship_class);
  const personal     = classified.filter(c => ["Family", "Personal Service", "Friend"].includes(c.relationship_class ?? ""));
  const vip          = classified.filter(c => ["Investor", "Funder", "Portfolio"].includes(c.relationship_class ?? ""));

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Hall · Intelligence
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Calendar <em className="font-black italic text-[#c8f55a]">Contacts</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                Who appears in your meetings — and how the system should treat them.
                Tagged contacts drive Suggested Time Blocks: personal meetings skip prep,
                VIP meetings get urgency boost.
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Observed" value={contacts.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Untagged" value={unclassified.length} color={unclassified.length > 0 ? "text-amber-400" : "text-white/30"} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Personal" value={personal.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="VIP" value={vip.length} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">
          {/* Activation rule */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-3.5">
            <p className="text-[11px] text-[#131218]/60 leading-snug">
              <strong className="text-[#131218]">How it works.</strong>{" "}
              When all non-you attendees are classified Family / Personal Service / Friend,
              the meeting stays on your calendar for slot planning but no prep / follow-up
              task is emitted. Investor / Funder / Portfolio attendees boost prep urgency.
              Unclassified attendees default to "unknown" — prep still emitted (fail-open).
            </p>
          </div>

          {/* Untagged queue */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Untagged — needs review</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {unclassified.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {unclassified.length}
                </span>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {unclassified.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-[#131218]/25">Nothing to tag. Every observed attendee has a class.</p>
                </div>
              ) : unclassified.map(c => (
                <HallContactRow key={c.email} {...c} />
              ))}
            </div>
          </section>

          {/* Classified */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Classified</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <span className="text-[10px] font-semibold text-[#131218]/30">{classified.length}</span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {classified.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-[#131218]/25">No contacts classified yet.</p>
                </div>
              ) : classified.map(c => (
                <HallContactRow key={c.email} {...c} />
              ))}
            </div>
          </section>
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

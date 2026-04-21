import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getContactByEmail,
  getContactTimeline,
  getContactWhatsappClips,
  isPersonalContact,
  isVipContact,
  type TimelineEntry,
} from "@/lib/contacts";
import { HallContactRow } from "@/components/HallContactRow";

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

function entryGlyph(kind: TimelineEntry["kind"]): string {
  if (kind === "meeting")    return "📅";
  if (kind === "transcript") return "🎙️";
  return "📧";
}

type Props = { params: Promise<{ email: string }> };

export default async function ContactDrawerPage({ params }: Props) {
  await requireAdmin();
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase();

  const [contact, timeline] = await Promise.all([
    getContactByEmail(email),
    getContactTimeline(email, 25),
  ]);

  if (!contact) return notFound();

  const whatsappClips = await getContactWhatsappClips(contact.display_name, 10);

  const personal = isPersonalContact(contact);
  const vip      = isVipContact(contact);

  const totalTouches = contact.meeting_count + contact.email_thread_count + contact.transcript_count;

  // Row data for the inline HallContactRow (chip editor, reuses existing code)
  const rowProps = {
    email:                 contact.email,
    display_name:          contact.display_name,
    relationship_class:    contact.relationship_classes[0] ?? null,
    relationship_classes:  contact.relationship_classes,
    auto_suggested:        contact.auto_suggested,
    last_meeting_title:    contact.last_meeting_title,
    meeting_count:         contact.meeting_count,
    last_seen_at:          contact.last_seen_at ?? contact.first_seen_at,
    classified_by:         contact.classified_by,
    google_resource_name:  contact.google_resource_name,
    google_source:         contact.google_source,
    google_last_write_at:  null,
  };

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
            <Link href="/admin/hall/contacts" className="hover:text-white/80 transition-colors">Calendar Contacts</Link>
            <span>›</span>
            <span className="text-white/50">{contact.display_name || email.split("@")[0]}</span>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none truncate">
                {contact.display_name || (
                  <em className="font-black italic text-[#c8f55a]">{email.split("@")[0]}</em>
                )}
              </h1>
              <p className="text-sm text-white/40 mt-3 truncate">{email}</p>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {contact.relationship_classes.map(cls => (
                  <span
                    key={cls}
                    className={`text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded ${
                      ["Family", "Personal Service", "Friend"].includes(cls) ? "bg-amber-500/20 text-amber-300"
                      : cls === "VIP"                                        ? "bg-[#B2FF59]/30 text-[#c8f55a]"
                      : "bg-white/10 text-white/70"
                    }`}
                  >
                    {cls}
                  </span>
                ))}
                {contact.relationship_classes.length === 0 && (
                  <span className="text-[9px] font-bold tracking-widest uppercase text-amber-400/80">
                    Untagged — no relationship class set
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Meetings"    value={contact.meeting_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Email threads" value={contact.email_thread_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Transcripts" value={contact.transcript_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Total touches" value={totalTouches} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">

          {/* Summary card */}
          <div className="grid grid-cols-3 gap-4">
            <Card label="First seen"      value={timeAgo(contact.first_seen_at)}   subtitle={formatWhen(contact.first_seen_at)} />
            <Card label="Last interaction" value={timeAgo(contact.last_seen_at)}   subtitle={contact.last_seen_at ? formatWhen(contact.last_seen_at) : "—"} />
            <Card
              label="Google Contacts"
              value={contact.google_resource_name
                ? (contact.google_resource_name.startsWith("otherContacts/") ? "Auto-saved" : "Saved")
                : "Not yet"}
              subtitle={contact.google_labels && contact.google_labels.length > 0 ? contact.google_labels.join(" · ") : "—"}
            />
          </div>

          {/* Tag editor (reuses row UI) */}
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/40 mb-3">Classification</h2>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <HallContactRow {...rowProps} />
            </div>
            <p className="text-[10px] text-[#131218]/50 mt-2 leading-snug">
              {personal && "All classes are personal — meetings with this contact skip prep in Suggested Time Blocks."}
              {vip && " This contact is a decision-maker: prep urgency is boosted +15."}
            </p>
          </section>

          {/* WhatsApp clips */}
          {whatsappClips.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/40 mb-3">
                WhatsApp conversations · {whatsappClips.length}
              </h2>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {whatsappClips.map((clip) => {
                  const first = new Date(clip.first_ts);
                  const last  = new Date(clip.last_ts);
                  const sameDay = first.toDateString() === last.toDateString();
                  const range = sameDay
                    ? formatWhen(clip.last_ts)
                    : `${formatWhen(clip.first_ts)} → ${formatWhen(clip.last_ts)}`;
                  const notionHref = clip.notion_id
                    ? `https://www.notion.so/${clip.notion_id.replace(/-/g, "")}`
                    : null;
                  return (
                    <div key={clip.source_id} className="px-5 py-4 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="flex items-start gap-4">
                        <span className="text-[15px] leading-none mt-0.5">💬</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#131218] truncate">
                            {clip.title}
                          </p>
                          <p className="text-[10px] text-[#131218]/45 mt-0.5">
                            <span className="uppercase tracking-wide font-bold">WhatsApp</span>
                            {" · "}{range}
                            {" · "}{timeAgo(clip.last_ts)}
                            {" · "}{clip.their_count}/{clip.total_count} msgs
                          </p>
                          {clip.preview.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {clip.preview.map((p, i) => (
                                <p key={i} className="text-[11px] text-[#131218]/60 leading-snug">
                                  <span className="font-semibold text-[#131218]/80">{p.sender}:</span>{" "}
                                  {p.text}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        {notionHref && (
                          <a
                            href={notionHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218]/80 self-center"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Timeline */}
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/40 mb-3">
              Recent activity · last {timeline.length}
            </h2>
            {timeline.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-8 text-center">
                <p className="text-sm text-[#131218]/25">No cross-channel activity recorded yet.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {timeline.map((entry, idx) => (
                  <div key={`${entry.kind}:${idx}`} className="flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
                    <span className="text-[15px] leading-none mt-0.5">{entryGlyph(entry.kind)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#131218] truncate">{entry.title}</p>
                      <p className="text-[10px] text-[#131218]/45 mt-0.5">
                        <span className="uppercase tracking-wide font-bold">{entry.kind}</span>
                        {" · "}{formatWhen(entry.at)}
                        {" · "}{timeAgo(entry.at)}
                        {entry.kind === "meeting"    && ` · ${entry.attendee_count} attendee${entry.attendee_count === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {entry.kind === "transcript" && entry.meeting_link && (
                      <a href={entry.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218]/80 self-center">
                        Open ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
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

function Card({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
      <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">{label}</p>
      <p className="text-[18px] font-bold text-[#131218] tracking-tight">{value}</p>
      <p className="text-[10px] text-[#131218]/40 font-medium mt-1.5">{subtitle}</p>
    </div>
  );
}


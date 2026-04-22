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
import {
  getEnrichmentByEmail,
  getSharedProjects,
  getCoAttendees,
  getContactOrganizations,
} from "@/lib/contact-profile";
import { HallContactRow } from "@/components/HallContactRow";
import { ReEnrichButton } from "@/components/ReEnrichButton";
import { SynthesizeTopicsButton } from "@/components/SynthesizeTopicsButton";

export const dynamic = "force-dynamic";

// ─── formatters ───────────────────────────────────────────────────────────────

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

function warmthFromLastSeen(iso: string | null): { label: string; tone: string } {
  if (!iso) return { label: "Cold", tone: "text-[#131218]/40" };
  const days = (Date.now() - new Date(iso).getTime()) / 86400_000;
  if (days < 7)   return { label: "🔥 Hot",  tone: "text-emerald-700" };
  if (days < 30)  return { label: "Warm",   tone: "text-amber-700"  };
  if (days < 90)  return { label: "Cooling", tone: "text-[#131218]/50" };
  return { label: "Cold", tone: "text-[#131218]/40" };
}

// ─── page ─────────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ email: string }> };

export default async function ContactDrawerPage({ params }: Props) {
  await requireAdmin();
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase();

  const [contact, timeline, enrichment] = await Promise.all([
    getContactByEmail(email),
    getContactTimeline(email, 25),
    getEnrichmentByEmail(email),
  ]);
  if (!contact) return notFound();

  const [whatsappClips, sharedProjects, coAttendees, organizations] = await Promise.all([
    getContactWhatsappClips(contact.display_name, 10),
    getSharedProjects(email),
    getCoAttendees(email, 8),
    getContactOrganizations(email, enrichment),
  ]);

  const personal      = isPersonalContact(contact);
  const vip           = isVipContact(contact);
  const totalTouches  = contact.meeting_count + contact.email_thread_count + contact.transcript_count;
  const warmth        = warmthFromLastSeen(contact.last_seen_at);
  const hasLinkedIn   = !!enrichment?.linkedin;
  const hasRoleSignal = !!(enrichment?.job_title || enrichment?.role_category || enrichment?.function_area);

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
            <Link href="/admin/hall/contacts" className="hover:text-white/80 transition-colors">Contacts</Link>
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
              {enrichment?.job_title && (
                <p className="text-[13px] text-white/70 mt-2 truncate">{enrichment.job_title}</p>
              )}
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
                {enrichment?.role_category && (
                  <span className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-white text-[#131218]">
                    {enrichment.role_category}
                  </span>
                )}
                {enrichment?.function_area && (
                  <span className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-[#c8f55a] text-[#131218]">
                    {enrichment.function_area}
                  </span>
                )}
                {contact.relationship_classes.length === 0 && !hasRoleSignal && (
                  <span className="text-[9px] font-bold tracking-widest uppercase text-amber-400/80">
                    Untagged — no relationship class set
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Meetings"      value={contact.meeting_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Email threads" value={contact.email_thread_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Transcripts"   value={contact.transcript_count} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Total touches" value={totalTouches} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">

          {/* ═══ Block 1 · Identity ═══════════════════════════════════════════ */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Identity</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {enrichment && <ReEnrichButton personId={enrichment.id} />}
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 space-y-3">
              {!hasLinkedIn && !hasRoleSignal ? (
                <p className="text-[11.5px] text-[#131218]/50 leading-snug">
                  Not enriched yet. Click <em>Re-enrich</em> above to have the agent search LinkedIn for this contact and extract their current role. This is also scheduled weekly via cron.
                </p>
              ) : (
                <>
                  {enrichment?.linkedin && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-[#131218]/40">🔗</span>
                      <a
                        href={enrichment.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#131218] underline decoration-[#131218]/30 underline-offset-2 hover:decoration-[#131218]/80 break-all"
                      >
                        {enrichment.linkedin.replace(/^https?:\/\//, "")}
                      </a>
                      {enrichment.linkedin_confidence != null && (
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-[#EFEFEA] text-[#131218]/70 px-2 py-0.5 rounded-full ml-1">
                          {Math.round(enrichment.linkedin_confidence * 100)}%
                        </span>
                      )}
                      {enrichment.linkedin_needs_review && (
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Needs review
                        </span>
                      )}
                    </div>
                  )}
                  {enrichment?.organization_detected && (
                    <p className="text-[11.5px] text-[#131218]/70">
                      🏢 <span className="font-semibold">{enrichment.organization_detected}</span>
                      <span className="text-[#131218]/40"> — detected from LinkedIn</span>
                    </p>
                  )}
                  {enrichment?.job_title && (
                    <p className="text-[11.5px] text-[#131218]/70">
                      {enrichment.job_title}
                      {enrichment.job_title_source && (
                        <span className="text-[10px] text-[#131218]/40"> · source {enrichment.job_title_source.replace(/_/g, " ")}</span>
                      )}
                      {enrichment.job_title_updated_at && (
                        <span className="text-[10px] text-[#131218]/40"> · {timeAgo(enrichment.job_title_updated_at)}</span>
                      )}
                    </p>
                  )}
                  {enrichment?.phone && (
                    <p className="text-[11.5px] text-[#131218]/70">📞 {enrichment.phone}</p>
                  )}
                  {(enrichment?.city || enrichment?.country) && (
                    <p className="text-[11.5px] text-[#131218]/70">📍 {[enrichment.city, enrichment.country].filter(Boolean).join(", ")}</p>
                  )}
                  {enrichment?.notes && (
                    <div className="mt-2 pt-3 border-t border-[#EFEFEA]">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1">Notes</p>
                      <p className="text-[11.5px] text-[#131218]/70 whitespace-pre-wrap leading-snug">{enrichment.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ═══ Block 2 · Relationship with CH ════════════════════════════════ */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Relationship</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <Card label="First seen"      value={timeAgo(contact.first_seen_at)} subtitle={formatWhen(contact.first_seen_at)} />
              <Card label="Last interaction" value={timeAgo(contact.last_seen_at)} subtitle={contact.last_seen_at ? formatWhen(contact.last_seen_at) : "—"} />
              <Card label="Warmth"          value={warmth.label} subtitle={`${totalTouches} touches total`} valueClass={warmth.tone} />
            </div>

            {/* Shared projects / recurring meetings */}
            {sharedProjects.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                  Projects & recurring meetings
                </p>
                <ul className="space-y-1.5">
                  {sharedProjects.map(p => (
                    <li key={p.project_name} className="flex items-center gap-3 text-[12px]">
                      <span className="flex-1 truncate text-[#131218]">{p.project_name}</span>
                      <span className="text-[10.5px] text-[#131218]/50 shrink-0 tabular-nums">
                        {p.meeting_count > 0 && <>📅 {p.meeting_count} </>}
                        {p.transcript_count > 0 && <>🎙️ {p.transcript_count} </>}
                        · {timeAgo(p.last_ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Co-attendees on CH side */}
            {coAttendees.some(a => a.is_self) && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                  Co-attended with (CH side)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {coAttendees.filter(a => a.is_self).map(a => (
                    <span key={a.email} className="text-[11px] bg-[#131218] text-white px-2.5 py-1 rounded-full">
                      {a.display_name ?? a.email.split("@")[0]}{" "}
                      <span className="text-white/50 text-[10px]">· {a.shared_touches}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Classification editor (existing UI) */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <HallContactRow {...rowProps} />
            </div>
            {(personal || vip) && (
              <p className="text-[10px] text-[#131218]/50 mt-2 leading-snug">
                {personal && "All classes are personal — meetings with this contact skip prep in Suggested Time Blocks."}
                {vip && " This contact is a decision-maker: prep urgency is boosted +15."}
              </p>
            )}
          </section>

          {/* ═══ Block 3 · Organizations network ═══════════════════════════════ */}
          {organizations.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Organizations</h2>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[10px] text-[#131218]/40 tabular-nums">{organizations.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {organizations.map((o, i) => (
                  <div key={`${o.domain || "enrichment"}:${i}`} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#131218] truncate">
                          🏢 {o.org_name ?? o.domain}
                        </span>
                        {o.is_primary && (
                          <span className="text-[9px] font-bold uppercase tracking-widest bg-[#c8f55a] text-[#131218] px-2 py-0.5 rounded-full">
                            Primary
                          </span>
                        )}
                        {o.is_ch && (
                          <span className="text-[9px] font-bold uppercase tracking-widest bg-[#131218] text-white px-2 py-0.5 rounded-full">
                            Common House
                          </span>
                        )}
                        {o.domain && o.domain !== o.org_name && (
                          <span className="text-[10px] text-[#131218]/40">{o.domain}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#131218]/50 shrink-0 tabular-nums">
                        {o.shared_meetings > 0 && <>🎙️ {o.shared_meetings} shared </>}
                        {o.last_ts && <>· {timeAgo(o.last_ts)}</>}
                      </div>
                    </div>
                    {o.other_contacts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 self-center">
                          You also know
                        </span>
                        {o.other_contacts.map(c => (
                          <Link
                            key={c.email}
                            href={`/admin/hall/contacts/${encodeURIComponent(c.email)}`}
                            prefetch={false}
                            className="text-[10.5px] bg-[#EFEFEA] text-[#131218]/80 hover:text-[#131218] hover:bg-[#E0E0D8] px-2 py-0.5 rounded-full transition-colors"
                          >
                            {c.display_name ?? c.email.split("@")[0]}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ═══ Block 4 · Conversation intelligence ═══════════════════════════ */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Conversation</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {enrichment && (
                <SynthesizeTopicsButton
                  personId={enrichment.id}
                  label={enrichment.recurring_topics && enrichment.recurring_topics.length > 0 ? "Refresh topics" : "Synthesise topics"}
                  force={!!(enrichment.recurring_topics && enrichment.recurring_topics.length > 0)}
                />
              )}
            </div>

            {/* Topics */}
            {enrichment?.recurring_topics && enrichment.recurring_topics.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                  Recurring topics
                  {enrichment.recurring_topics_updated_at && (
                    <span className="text-[#131218]/30"> · {timeAgo(enrichment.recurring_topics_updated_at)}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.recurring_topics.map(t => (
                    <span key={t} className="text-[11px] bg-[#c8f55a]/30 text-[#131218] px-2.5 py-1 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp clips */}
            {whatsappClips.length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                  WhatsApp conversations · {whatsappClips.length}
                </p>
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
                            <p className="text-[12px] font-semibold text-[#131218] truncate">{clip.title}</p>
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
                            <a href={notionHref} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218]/80 self-center">
                              Open ↗
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                Recent activity · last {timeline.length}
              </p>
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
                          {entry.kind === "meeting" && ` · ${entry.attendee_count} attendee${entry.attendee_count === 1 ? "" : "s"}`}
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
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function Stat({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-right">
      <p className={`text-[2rem] font-black tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">{label}</p>
    </div>
  );
}

function Card({
  label, value, subtitle, valueClass = "text-[#131218]",
}: {
  label: string;
  value: string;
  subtitle: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
      <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">{label}</p>
      <p className={`text-[18px] font-bold tracking-tight ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-[#131218]/40 font-medium mt-1.5">{subtitle}</p>
    </div>
  );
}

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
  getAdjacentContacts,
} from "@/lib/contact-profile";
import { HallContactRow } from "@/components/HallContactRow";
import { ReEnrichButton } from "@/components/ReEnrichButton";
import { SynthesizeTopicsButton } from "@/components/SynthesizeTopicsButton";
import { CollapsibleList } from "@/components/CollapsibleList";
import { ContactIdentityEditor } from "@/components/ContactIdentityEditor";
import { ContactAISummary } from "@/components/ContactAISummary";
import { ContactOpenLoops } from "@/components/ContactOpenLoops";
import { ContactAvatar } from "@/components/ContactAvatar";
import { ContactNewsMentions } from "@/components/ContactNewsMentions";
import { ScanNewsButton } from "@/components/ScanNewsButton";

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

function labelForSource(source: string): string {
  // Human labels for the various enrichment sources we track. Some are
  // historical (google_cse_snippet predates the pivot to Anthropic web search).
  const map: Record<string, string> = {
    manual:                 "entered manually",
    google_cse_snippet:     "inferred from web search",
    anthropic_web_search:   "inferred from web search",
    clearbit:               "via Clearbit",
    apollo:                 "via Apollo",
    linkedin_api:           "via LinkedIn API",
  };
  return map[source] ?? source.replace(/_/g, " ");
}

function warmthFromLastSeen(iso: string | null): { label: string; tone: string } {
  if (!iso) return { label: "Cold", tone: "var(--hall-muted-3)" };
  const days = (Date.now() - new Date(iso).getTime()) / 86400_000;
  if (days < 7)   return { label: "Hot",     tone: "var(--hall-ok)" };
  if (days < 30)  return { label: "Warm",    tone: "var(--hall-warn)" };
  if (days < 90)  return { label: "Cooling", tone: "var(--hall-muted-2)" };
  return { label: "Cold", tone: "var(--hall-muted-3)" };
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

  const [whatsappClips, sharedProjects, coAttendees, organizations, adjacent] = await Promise.all([
    getContactWhatsappClips({ person_id: enrichment?.id ?? null, display_name: contact.display_name }, 10),
    getSharedProjects(email),
    getCoAttendees(email, 8),
    getContactOrganizations(email, enrichment),
    getAdjacentContacts(email),
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
    <div className="flex min-h-screen">
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* ── K-v2 one-line header ─────────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HALL · <Link href="/admin/hall/contacts" className="hover:underline" style={{ color: "var(--hall-ink-0)" }}><b>CONTACTS</b></Link>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {contact.display_name || (
                <em
                  style={{
                    fontFamily: "var(--font-hall-display)",
                    fontStyle: "italic",
                    fontWeight: 400,
                  }}
                >
                  {email.split("@")[0]}
                </em>
              )}
            </h1>
          </div>
          <div
            className="flex items-center gap-3 text-[10px] tracking-[0.08em] uppercase"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {adjacent.position != null && (
              <span className="tabular-nums">
                {adjacent.position} / {adjacent.total}
              </span>
            )}
            {adjacent.prev ? (
              <Link
                href={`/admin/hall/contacts/${encodeURIComponent(adjacent.prev.email)}`}
                prefetch={false}
                className="hall-btn-outline"
                style={{ padding: "4px 10px", fontSize: 10 }}
                title={`← ${adjacent.prev.display_name ?? adjacent.prev.full_name ?? adjacent.prev.email}`}
              >
                ← Prev
              </Link>
            ) : (
              <span className="hall-btn-outline" style={{ padding: "4px 10px", fontSize: 10, opacity: 0.35 }}>← Prev</span>
            )}
            {adjacent.next ? (
              <Link
                href={`/admin/hall/contacts/${encodeURIComponent(adjacent.next.email)}`}
                prefetch={false}
                className="hall-btn-outline"
                style={{ padding: "4px 10px", fontSize: 10 }}
                title={`${adjacent.next.display_name ?? adjacent.next.full_name ?? adjacent.next.email} →`}
              >
                Next →
              </Link>
            ) : (
              <span className="hall-btn-outline" style={{ padding: "4px 10px", fontSize: 10, opacity: 0.35 }}>Next →</span>
            )}
          </div>
        </header>

        {/* ── Profile strip ─────────────────────────────────────────────── */}
        <div
          className="flex items-start justify-between gap-6 px-9 py-6"
          style={{ borderBottom: "1px solid var(--hall-line)" }}
        >
          <div className="flex items-center gap-5 min-w-0">
            <ContactAvatar
              photoUrl={enrichment?.photo_url ?? null}
              display={contact.display_name || email.split("@")[0] || "?"}
              size={72}
              rounded="lg"
            />
            <div className="min-w-0">
              <h2
                className="text-[24px] font-bold tracking-[-0.02em] leading-tight truncate"
                style={{ color: "var(--hall-ink-0)" }}
              >
                {contact.display_name || email.split("@")[0]}
              </h2>
              {enrichment?.job_title && (
                <p className="text-[13px] mt-1 truncate" style={{ color: "var(--hall-ink-3)" }}>
                  {enrichment.job_title}
                </p>
              )}
              <p
                className="text-[11px] mt-1 truncate"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                {email}
              </p>
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {contact.relationship_classes.map(cls => (
                  <span
                    key={cls}
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      background: cls === "VIP" ? "var(--hall-ink-0)" : "var(--hall-fill-soft)",
                      color: cls === "VIP" ? "var(--hall-paper-0)" : "var(--hall-ink-0)",
                    }}
                  >
                    {cls}
                  </span>
                ))}
                {enrichment?.role_category && (
                  <span
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      border: "1px solid var(--hall-ink-0)",
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    {enrichment.role_category}
                  </span>
                )}
                {enrichment?.function_area && (
                  <span
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      border: "1px solid var(--hall-ink-0)",
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    {enrichment.function_area}
                  </span>
                )}
                {contact.relationship_classes.length === 0 && !hasRoleSignal && (
                  <span
                    className="text-[9px] tracking-[0.08em] uppercase"
                    style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-warn)" }}
                  >
                    Untagged — no relationship class set
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <Stat label="Meetings"      value={contact.meeting_count} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Email threads" value={contact.email_thread_count} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Transcripts"   value={contact.transcript_count} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Total touches" value={totalTouches} />
          </div>
        </div>

        <div className="px-9 py-7 max-w-5xl space-y-7">

          {/* ═══ Block 0 · AI summary + Open loops (briefing strip) ═════════════ */}
          {enrichment && (
            <div className="space-y-3">
              <ContactAISummary
                personId={enrichment.id}
                summary={enrichment.ai_summary}
                updatedAt={enrichment.ai_summary_updated_at}
              />
              <ContactOpenLoops
                personId={enrichment.id}
                loops={enrichment.open_loops}
                updatedAt={enrichment.open_loops_updated_at}
              />
            </div>
          )}

          {/* ═══ Block 1 · Identity ═══════════════════════════════════════════ */}
          <section className="mb-7">
            <SectionHead
              title="Identity"
              right={enrichment && (
                <div className="flex items-center gap-2">
                  <ContactIdentityEditor
                    personId={enrichment.id}
                    initial={{
                      full_name:    enrichment.full_name,
                      display_name: enrichment.display_name,
                      linkedin:     enrichment.linkedin,
                      job_title:    enrichment.job_title,
                      phone:        enrichment.phone,
                      notes:        enrichment.notes,
                      city:         enrichment.city,
                      country:      enrichment.country,
                    }}
                  />
                  <ReEnrichButton personId={enrichment.id} />
                </div>
              )}
            />
            <div className="space-y-3">
              {!hasLinkedIn && !hasRoleSignal ? (
                <p className="text-[11.5px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
                  Not enriched yet. Click <em>Re-enrich</em> above to have the agent search LinkedIn for this contact and extract their current role. This is also scheduled weekly via cron.
                </p>
              ) : (
                <>
                  {enrichment?.linkedin && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <span style={{ color: "var(--hall-muted-3)" }}>linkedin</span>
                      <a
                        href={enrichment.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 break-all hover:opacity-80"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {enrichment.linkedin.replace(/^https?:\/\//, "")}
                      </a>
                      {enrichment.linkedin_confidence != null && (
                        <span
                          className="text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 ml-1"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontWeight: 700,
                            background: "var(--hall-fill-soft)",
                            color: "var(--hall-muted-2)",
                          }}
                        >
                          {Math.round(enrichment.linkedin_confidence * 100)}%
                        </span>
                      )}
                      {enrichment.linkedin_needs_review && (
                        <span
                          className="text-[9px] uppercase tracking-[0.08em] px-2 py-0.5"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontWeight: 700,
                            background: "var(--hall-warn-soft)",
                            color: "var(--hall-warn)",
                          }}
                        >
                          Needs review
                        </span>
                      )}
                    </div>
                  )}
                  {enrichment?.organization_detected && (
                    <p className="text-[11.5px]" style={{ color: "var(--hall-ink-3)" }}>
                      <span className="font-semibold">{enrichment.organization_detected}</span>
                      <span style={{ color: "var(--hall-muted-3)" }}> — detected from LinkedIn</span>
                    </p>
                  )}
                  {enrichment?.job_title && (
                    <p className="text-[11.5px]" style={{ color: "var(--hall-ink-3)" }}>
                      {enrichment.job_title}
                      {enrichment.job_title_source && (
                        <span className="text-[10px]" style={{ color: "var(--hall-muted-3)" }}> · {labelForSource(enrichment.job_title_source)}</span>
                      )}
                      {enrichment.job_title_updated_at && (
                        <span className="text-[10px]" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}> · {timeAgo(enrichment.job_title_updated_at)}</span>
                      )}
                    </p>
                  )}
                  {enrichment?.phone && (
                    <p className="text-[11.5px]" style={{ color: "var(--hall-ink-3)" }}>{enrichment.phone}</p>
                  )}
                  {(enrichment?.city || enrichment?.country) && (
                    <p className="text-[11.5px]" style={{ color: "var(--hall-ink-3)" }}>{[enrichment.city, enrichment.country].filter(Boolean).join(", ")}</p>
                  )}
                  {enrichment?.notes && (
                    <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                      <p
                        className="text-[9px] uppercase tracking-[0.08em] mb-1"
                        style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                      >
                        Notes
                      </p>
                      <p className="text-[11.5px] whitespace-pre-wrap leading-snug" style={{ color: "var(--hall-ink-3)" }}>{enrichment.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ═══ Block 2 · Relationship with CH ════════════════════════════════ */}
          <section className="mb-7">
            <SectionHead title="Relationship" flourish="with CH" />

            <div className="grid grid-cols-3 gap-3 mb-4">
              <Card label="First seen"       value={timeAgo(contact.first_seen_at)} subtitle={formatWhen(contact.first_seen_at)} />
              <Card label="Last interaction" value={timeAgo(contact.last_seen_at)} subtitle={contact.last_seen_at ? formatWhen(contact.last_seen_at) : "—"} />
              <Card label="Warmth"           value={warmth.label} subtitle={`${totalTouches} touches total`} valueColor={warmth.tone} />
            </div>

            {/* Shared projects / recurring meetings */}
            {sharedProjects.length > 0 && (
              <div className="mb-4">
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  Projects & recurring meetings
                </p>
                <ul className="flex flex-col">
                  <CollapsibleList initialVisible={5} moreLabel="more">
                    {sharedProjects.map(p => (
                      <li
                        key={p.project_name}
                        className="flex items-center gap-3 py-2.5 text-[12px]"
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        <span className="flex-1 truncate" style={{ color: "var(--hall-ink-0)" }}>{p.project_name}</span>
                        <span
                          className="text-[10.5px] shrink-0 tabular-nums"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                        >
                          {p.meeting_count > 0 && <>{p.meeting_count} mtg </>}
                          {p.transcript_count > 0 && <>{p.transcript_count} tx </>}
                          · {timeAgo(p.last_ts)}
                        </span>
                      </li>
                    ))}
                  </CollapsibleList>
                </ul>
              </div>
            )}

            {/* Co-attendees on CH side */}
            {coAttendees.some(a => a.is_self) && (
              <div className="mb-4">
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  Co-attended with (CH side)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {coAttendees.filter(a => a.is_self).map(a => (
                    <span
                      key={a.email}
                      className="text-[11px] px-2.5 py-1"
                      style={{ background: "var(--hall-ink-0)", color: "var(--hall-paper-0)" }}
                    >
                      {a.display_name ?? a.email.split("@")[0]}{" "}
                      <span className="text-[10px]" style={{ opacity: 0.6 }}>· {a.shared_touches}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Classification editor (existing UI) */}
            <div>
              <HallContactRow {...rowProps} />
            </div>
            {(personal || vip) && (
              <p className="text-[10px] mt-2 leading-snug" style={{ color: "var(--hall-muted-2)" }}>
                {personal && "All classes are personal — meetings with this contact skip prep in Suggested Time Blocks."}
                {vip && " This contact is a decision-maker: prep urgency is boosted +15."}
              </p>
            )}
          </section>

          {/* ═══ Block 3 · Organizations network ═══════════════════════════════ */}
          {organizations.length > 0 && (
            <section className="mb-7">
              <SectionHead title="Organizations" meta={`${organizations.length} TOTAL`} />
              <ul className="flex flex-col">
                <CollapsibleList
                  initialVisible={5}
                  moreLabel={organizations.length - 5 === 1 ? "more organization" : "more organizations"}
                >
                  {organizations.map((o, i) => (
                    <li
                      key={`${o.domain || "enrichment"}:${i}`}
                      className="py-4"
                      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>
                            {o.org_name ?? o.domain}
                          </span>
                          {o.is_primary && (
                            <span
                              className="text-[9px] uppercase tracking-[0.08em] px-2 py-0.5"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontWeight: 700,
                                background: "var(--hall-ink-0)",
                                color: "var(--hall-paper-0)",
                              }}
                            >
                              Primary
                            </span>
                          )}
                          {o.is_ch && (
                            <span
                              className="text-[9px] uppercase tracking-[0.08em] px-2 py-0.5"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontWeight: 700,
                                border: "1px solid var(--hall-ink-0)",
                                color: "var(--hall-ink-0)",
                              }}
                            >
                              Common House
                            </span>
                          )}
                          {o.domain && o.domain !== o.org_name && (
                            <span
                              className="text-[10px]"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                            >
                              {o.domain}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[10px] shrink-0 tabular-nums"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                        >
                          {o.shared_meetings > 0 && <>{o.shared_meetings} shared </>}
                          {o.last_ts && <>· {timeAgo(o.last_ts)}</>}
                        </div>
                      </div>
                      {o.other_contacts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                          <span
                            className="text-[9px] uppercase tracking-[0.08em] self-center"
                            style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-3)" }}
                          >
                            You also know
                          </span>
                          {o.other_contacts.map(c => (
                            <Link
                              key={c.email}
                              href={`/admin/hall/contacts/${encodeURIComponent(c.email)}`}
                              prefetch={false}
                              className="text-[10.5px] px-2 py-0.5 transition-colors hover:opacity-80"
                              style={{ background: "var(--hall-fill-soft)", color: "var(--hall-ink-3)" }}
                            >
                              {c.display_name ?? c.email.split("@")[0]}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </CollapsibleList>
              </ul>
            </section>
          )}

          {/* ═══ Block 3.5 · News & LinkedIn activity (VIPs only) ═════════════ */}
          {enrichment && contact.relationship_classes.includes("VIP") && (
            <section className="mb-7">
              <SectionHead
                title="News"
                flourish="& activity"
                right={<ScanNewsButton personId={enrichment.id} />}
              />
              <ContactNewsMentions personId={enrichment.id} lastScanAt={enrichment.last_news_scan_at} />
            </section>
          )}

          {/* ═══ Block 4 · Conversation intelligence ═══════════════════════════ */}
          <section className="mb-7">
            <SectionHead
              title="Conversation"
              right={enrichment && (
                <SynthesizeTopicsButton
                  personId={enrichment.id}
                  label={enrichment.recurring_topics && enrichment.recurring_topics.length > 0 ? "Refresh topics" : "Synthesise topics"}
                  force={!!(enrichment.recurring_topics && enrichment.recurring_topics.length > 0)}
                />
              )}
            />

            {/* Topics */}
            {enrichment?.recurring_topics && enrichment.recurring_topics.length > 0 && (
              <div className="mb-4">
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  Recurring topics
                  {enrichment.recurring_topics_updated_at && (
                    <span style={{ color: "var(--hall-muted-3)" }}> · {timeAgo(enrichment.recurring_topics_updated_at)}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.recurring_topics.map(t => (
                    <span
                      key={t}
                      className="text-[11px] px-2.5 py-1"
                      style={{ background: "var(--hall-fill-soft)", color: "var(--hall-ink-0)", border: "1px solid var(--hall-line)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp clips */}
            {whatsappClips.length > 0 && (
              <div className="mb-4">
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  WhatsApp conversations · {whatsappClips.length}
                </p>
                <ul className="flex flex-col">
                  <CollapsibleList
                    initialVisible={3}
                    moreLabel={whatsappClips.length - 3 === 1 ? "more conversation" : "more conversations"}
                  >
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
                      <li
                        key={clip.source_id}
                        className="py-4 transition-colors hover:bg-[var(--hall-fill-soft)]"
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{clip.title}</p>
                            <p
                              className="text-[10px] mt-0.5"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                            >
                              <span className="uppercase tracking-wide">WhatsApp</span>
                              {" · "}{range}
                              {" · "}{timeAgo(clip.last_ts)}
                              {" · "}{clip.their_count}/{clip.total_count} msgs
                            </p>
                            {clip.preview.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {clip.preview.map((p, i) => (
                                  <p key={i} className="text-[11px] leading-snug" style={{ color: "var(--hall-ink-3)" }}>
                                    <span className="font-semibold" style={{ color: "var(--hall-ink-0)" }}>{p.sender}:</span>{" "}
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
                              className="text-[9px] uppercase tracking-[0.08em] self-center"
                              style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                            >
                              Open ↗
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  </CollapsibleList>
                </ul>
              </div>
            )}

            {/* Timeline */}
            <div>
              <p
                className="text-[9px] uppercase tracking-[0.08em] mb-2"
                style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
              >
                Recent activity · last {timeline.length}
              </p>
              {timeline.length === 0 ? (
                <div className="px-1 py-6 text-center">
                  <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No cross-channel activity recorded yet.</p>
                </div>
              ) : (
                <ul className="flex flex-col">
                  <CollapsibleList
                    initialVisible={5}
                    moreLabel={timeline.length - 5 === 1 ? "more event" : "more events"}
                  >
                    {timeline.map((entry, idx) => (
                      <li
                        key={`${entry.kind}:${idx}`}
                        className="flex items-start gap-4 py-3 transition-colors hover:bg-[var(--hall-fill-soft)]"
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        <span className="text-[14px] leading-none mt-0.5" aria-hidden>{entryGlyph(entry.kind)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{entry.title}</p>
                          <p
                            className="text-[10px] mt-0.5"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                          >
                            <span className="uppercase tracking-wide">{entry.kind}</span>
                            {" · "}{formatWhen(entry.at)}
                            {" · "}{timeAgo(entry.at)}
                            {entry.kind === "meeting" && ` · ${entry.attendee_count} attendee${entry.attendee_count === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        {entry.kind === "transcript" && entry.meeting_link && (
                          <a
                            href={entry.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] uppercase tracking-[0.08em] self-center"
                            style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                          >
                            Open ↗
                          </a>
                        )}
                      </li>
                    ))}
                  </CollapsibleList>
                </ul>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <p
        className="text-[20px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
      >
        {value}
      </p>
      <p
        className="text-[9px] tracking-[0.08em] uppercase mt-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
    </div>
  );
}

function Card({
  label, value, subtitle, valueColor,
}: {
  label: string;
  value: string;
  subtitle: string;
  valueColor?: string;
}) {
  return (
    <div
      className="px-4 py-3"
      style={{ border: "1px solid var(--hall-line)" }}
    >
      <p
        className="text-[9px] uppercase tracking-[0.08em] mb-2"
        style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-3)" }}
      >
        {label}
      </p>
      <p
        className="text-[17px] font-bold leading-tight"
        style={{ letterSpacing: "-0.02em", color: valueColor ?? "var(--hall-ink-0)" }}
      >
        {value}
      </p>
      <p
        className="text-[10px] mt-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function SectionHead({ title, flourish, meta, right }: { title: string; flourish?: string; meta?: string; right?: React.ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
    >
      <h2
        className="text-[19px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
      >
        {title}
        {flourish && (
          <>
            {" "}
            <em
              style={{
                fontFamily: "var(--font-hall-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--hall-ink-0)",
              }}
            >
              {flourish}
            </em>
          </>
        )}
      </h2>
      {meta && (
        <span
          className="text-[10px] tracking-[0.06em] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {meta}
        </span>
      )}
      {right}
    </div>
  );
}

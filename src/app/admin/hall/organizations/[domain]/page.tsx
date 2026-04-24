import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getOrganizationDetail, type TimelineEntry } from "@/lib/contacts";
import { getOrgCrossRef, getOrgStrongestRelationships } from "@/lib/contact-profile";
import { HallOrganizationTagEditor } from "@/components/HallOrganizationTagEditor";
import { HallContactRow } from "@/components/HallContactRow";

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

function entryGlyph(kind: TimelineEntry["kind"]): string {
  if (kind === "meeting")    return "\u{1F4C5}";
  if (kind === "transcript") return "\u{1F399}";
  return "✉️";
}

type Props = { params: Promise<{ domain: string }> };

export default async function OrganizationDrawer({ params }: Props) {
  await requireAdmin();
  const { domain: raw } = await params;
  const domain = decodeURIComponent(raw).toLowerCase();

  const { org, contacts, timeline } = await getOrganizationDetail(domain, 40);

  // If not registered, still show the page with a register prompt (there ARE
  // contacts at this domain — that's enough to be useful).
  if (!org && contacts.length === 0) return notFound();

  const [crossRef, strongestRel] = await Promise.all([
    getOrgCrossRef(org?.notion_id ?? null),
    getOrgStrongestRelationships(domain),
  ]);

  // Warmth + role breakdown from contacts list
  const warmthBreakdown = contacts.reduce((acc, c) => {
    if (!c.last_seen_at) { acc.cold++; return acc; }
    const days = Math.floor((Date.now() - new Date(c.last_seen_at).getTime()) / 86400_000);
    if (days < 7)   acc.hot++;
    else if (days < 30)  acc.warm++;
    else if (days < 90)  acc.cooling++;
    else                 acc.cold++;
    return acc;
  }, { hot: 0, warm: 0, cooling: 0, cold: 0 });

  // Pipeline total value for this org (for the stat strip)
  const pipelineValue = crossRef.opportunities.reduce((s, o) => s + (o.value_estimate ?? 0), 0);

  const name = org?.name ?? domain;
  const touches = (org?.meeting_sum ?? 0) + (org?.email_sum ?? 0) + (org?.transcript_sum ?? 0)
    || contacts.reduce((a, c) => a + (c.meeting_count + c.email_thread_count + c.transcript_count), 0);
  const lastAt = org?.last_interaction_at
    ?? contacts.map(c => c.last_seen_at).filter((x): x is string => !!x).sort().pop()
    ?? null;

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
              HALL · <Link href="/admin/hall/organizations" className="hover:underline" style={{ color: "var(--hall-ink-0)" }}><b>ORGANIZATIONS</b></Link>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                {name}
              </em>
            </h1>
          </div>
        </header>

        {/* ── Profile strip ─────────────────────────────────────────────── */}
        <div
          className="flex items-start justify-between gap-6 px-9 py-6"
          style={{ borderBottom: "1px solid var(--hall-line)" }}
        >
          <div className="min-w-0">
            <h2
              className="text-[24px] font-bold tracking-[-0.02em] leading-tight truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {name}
            </h2>
            <p
              className="text-[11px] mt-1"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              @{domain}
            </p>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {!org && (
                <span
                  className="text-[9px] px-2 py-0.5 uppercase"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    background: "var(--hall-warn-soft)",
                    color: "var(--hall-warn)",
                  }}
                >
                  NOT REGISTERED
                </span>
              )}
              {org?.relationship_classes.map(c => (
                <span
                  key={c}
                  className="text-[9px] px-2 py-0.5 uppercase"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    background: c === "VIP" ? "var(--hall-ink-0)" : "var(--hall-fill-soft)",
                    color: c === "VIP" ? "var(--hall-paper-0)" : "var(--hall-ink-0)",
                  }}
                >
                  {c}
                </span>
              ))}
              {org?.notion_id && (
                <span
                  className="text-[9px] px-2 py-0.5 uppercase"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    border: "1px solid var(--hall-line)",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  ✓ CH ORGS [OS v2]
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <Stat label="Contacts"     value={contacts.length} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Meetings"     value={org?.meeting_sum    ?? contacts.reduce((a, c) => a + c.meeting_count, 0)} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Email threads" value={org?.email_sum     ?? contacts.reduce((a, c) => a + c.email_thread_count, 0)} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Transcripts"  value={org?.transcript_sum ?? contacts.reduce((a, c) => a + c.transcript_count, 0)} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Total"        value={touches} />
          </div>
        </div>

        <div className="px-9 py-7 max-w-5xl space-y-7">

          {/* Summary cards — 4 columns */}
          <div className="grid grid-cols-4 gap-4">
            <Card label="Last interaction" value={timeAgo(lastAt)} subtitle={lastAt ? formatWhen(lastAt) : "—"} />
            <Card
              label="VIP contacts"
              value={`${org?.vip_contact_count ?? contacts.filter(c => c.relationship_classes?.includes("VIP")).length} / ${contacts.length}`}
              subtitle="Decision-makers tagged"
            />
            <Card
              label="Pipeline"
              value={crossRef.opportunities.length > 0 ? `${crossRef.opportunities.length} open` : "—"}
              subtitle={pipelineValue > 0 ? `~${formatValue(pipelineValue)} est.` : "No active opportunities"}
            />
            <Card
              label="Active projects"
              value={crossRef.projects.length > 0 ? String(crossRef.projects.length) : "—"}
              subtitle={crossRef.projects[0]?.name ?? (org?.notion_id ? "None in OS v2" : "Org not linked to Notion")}
            />
          </div>

          {/* Warmth + strongest CH relationships */}
          <section className="mb-7">
            <SectionHead title="Warmth" flourish="+ CH relationships" />
            <div className="grid grid-cols-2 gap-4">
              <div className="px-4 py-3" style={{ border: "1px solid var(--hall-line)" }}>
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-3"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  Warmth breakdown · {contacts.length} contacts
                </p>
                <div className="flex items-center gap-4 text-[12px]">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-bold" style={{ color: "var(--hall-ok)" }}>{warmthBreakdown.hot}</span>
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Hot
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-bold" style={{ color: "var(--hall-warn)" }}>{warmthBreakdown.warm}</span>
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Warm
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-bold" style={{ color: "var(--hall-muted-2)" }}>{warmthBreakdown.cooling}</span>
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Cooling
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-bold" style={{ color: "var(--hall-muted-3)" }}>{warmthBreakdown.cold}</span>
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Cold
                    </span>
                  </span>
                </div>
              </div>
              <div className="px-4 py-3" style={{ border: "1px solid var(--hall-line)" }}>
                <p
                  className="text-[9px] uppercase tracking-[0.08em] mb-3"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                >
                  Strongest CH relationships
                </p>
                {strongestRel.length === 0 ? (
                  <p className="text-[11.5px] italic" style={{ color: "var(--hall-muted-3)" }}>No co-attended meetings recorded yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {strongestRel.map(r => (
                      <li key={r.email} className="flex items-center gap-3 text-[12px]">
                        <span className="flex-1 truncate" style={{ color: "var(--hall-ink-0)" }}>{r.display_name ?? r.email.split("@")[0]}</span>
                        <span
                          className="text-[10.5px] tabular-nums shrink-0"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                        >
                          {r.shared_touches} shared
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Pipeline cross-reference */}
          {crossRef.opportunities.length > 0 && (
            <section className="mb-7">
              <SectionHead title="Pipeline" flourish={`at ${name}`} meta={`${crossRef.opportunities.length} OPEN`} />
              <ul className="flex flex-col">
                {crossRef.opportunities.map(o => (
                  <li key={o.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <Link
                      href={`/admin/opportunities?highlight=${encodeURIComponent(o.id)}`}
                      prefetch={false}
                      className="flex items-start gap-4 py-3 transition-colors hover:bg-[var(--hall-fill-soft)] px-1"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{o.title}</p>
                        <p
                          className="text-[10.5px] mt-0.5"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                        >
                          {o.status && <span className="uppercase tracking-wide">{o.status}</span>}
                          {o.opportunity_score != null && <span> · score {Math.round(o.opportunity_score)}</span>}
                          {o.probability != null && <span> · {Math.round(o.probability * 100)}%</span>}
                          {o.value_estimate != null && o.value_estimate > 0 && <span> · {formatValue(o.value_estimate)}</span>}
                          {o.expected_close_date && <span> · close {formatWhen(o.expected_close_date)}</span>}
                        </p>
                        {o.suggested_next_step && (
                          <p className="text-[10.5px] mt-0.5 truncate italic" style={{ color: "var(--hall-ink-3)" }}>→ {o.suggested_next_step}</p>
                        )}
                      </div>
                      <span
                        className="text-[9px] uppercase tracking-[0.08em] shrink-0 self-center"
                        style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)" }}
                      >
                        Open →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Project cross-reference */}
          {crossRef.projects.length > 0 && (
            <section className="mb-7">
              <SectionHead title="Projects" flourish={`involving ${name}`} meta={`${crossRef.projects.length} TOTAL`} />
              <ul className="flex flex-col">
                {crossRef.projects.map(p => (
                  <li
                    key={p.id}
                    className="py-3 px-1"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                      <p
                        className="text-[10.5px] mt-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                      >
                        {p.project_status && <span className="uppercase tracking-wide">{p.project_status}</span>}
                        {p.current_stage && <span> · {p.current_stage}</span>}
                        {p.last_meeting_date && <span> · last meeting {timeAgo(p.last_meeting_date)}</span>}
                      </p>
                      {p.hall_current_focus && (
                        <p className="text-[10.5px] mt-0.5 truncate italic" style={{ color: "var(--hall-ink-3)" }}>→ {p.hall_current_focus}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Classification editor (server-side data, client-side chips) */}
          <section className="mb-7">
            <SectionHead title="Classification" />
            <div>
              <HallOrganizationTagEditor
                domain={domain}
                currentClasses={org?.relationship_classes ?? []}
                currentName={org?.name ?? null}
                notion_id={org?.notion_id ?? null}
                contactCount={contacts.length}
                dismissed={!!org?.dismissed_at}
              />
              {org?.notes && (
                <p className="text-[11px] mt-3 italic" style={{ color: "var(--hall-muted-2)" }}>{org.notes}</p>
              )}
            </div>
          </section>

          {/* Contacts at this org */}
          <section className="mb-7">
            <SectionHead title="Contacts" flourish={`at ${name}`} meta={`${contacts.length} TOTAL`} />
            {contacts.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No contacts observed at this domain yet.</p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {contacts.map(c => (
                  <li key={c.email} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <HallContactRow
                      email={c.email}
                      display_name={c.display_name}
                      relationship_class={c.relationship_classes?.[0] ?? null}
                      auto_suggested={c.auto_suggested}
                      last_meeting_title={c.last_meeting_title}
                      meeting_count={c.meeting_count}
                      last_seen_at={c.last_seen_at ?? c.first_seen_at}
                      classified_by={c.classified_by}
                      google_resource_name={c.google_resource_name}
                      google_source={c.google_source}
                      google_last_write_at={null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Cross-channel timeline */}
          <section className="mb-7">
            <SectionHead title="Recent activity" meta={`LAST ${timeline.length}`} />
            {timeline.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No cross-channel activity recorded yet.</p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {timeline.map((entry, idx) => (
                  <li
                    key={`${entry.kind}:${idx}`}
                    className="flex items-start gap-4 py-3 transition-colors hover:bg-[var(--hall-fill-soft)] px-1"
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
              </ul>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

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

function SectionHead({ title, flourish, meta }: { title: string; flourish?: string; meta?: string }) {
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
    </div>
  );
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

function Card({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="px-4 py-3" style={{ border: "1px solid var(--hall-line)" }}>
      <p
        className="text-[9px] uppercase tracking-[0.08em] mb-2"
        style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-3)" }}
      >
        {label}
      </p>
      <p
        className="text-[17px] font-bold leading-tight"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
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

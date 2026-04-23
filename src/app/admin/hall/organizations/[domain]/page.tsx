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
  if (kind === "meeting")    return "📅";
  if (kind === "transcript") return "🎙️";
  return "📧";
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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
            <Link href="/admin/hall/organizations" className="hover:text-white/80 transition-colors">Organizations</Link>
            <span>›</span>
            <span className="text-white/50">{name}</span>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none truncate">
                <em className="font-black italic text-[#c8f55a]">{name}</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">@{domain}</p>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {!org && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">NOT REGISTERED</span>
                )}
                {org?.relationship_classes.map(c => (
                  <span
                    key={c}
                    className={`text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded ${
                      c === "VIP" ? "bg-[#B2FF59]/30 text-[#c8f55a]" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {c}
                  </span>
                ))}
                {org?.notion_id && (
                  <span className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-white/10 text-white/50">
                    ✓ CH ORGS [OS v2]
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Contacts"     value={contacts.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Meetings"     value={org?.meeting_sum    ?? contacts.reduce((a, c) => a + c.meeting_count, 0)} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Email threads" value={org?.email_sum     ?? contacts.reduce((a, c) => a + c.email_thread_count, 0)} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Transcripts"  value={org?.transcript_sum ?? contacts.reduce((a, c) => a + c.transcript_count, 0)} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Total"        value={touches} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">

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
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Warmth · CH relationships</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/45 mb-3">
                  Warmth breakdown · {contacts.length} contacts
                </p>
                <div className="flex items-center gap-4 text-[12px]">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-black text-emerald-700">{warmthBreakdown.hot}</span>
                    <span className="text-[10px] text-[#131218]/45 uppercase tracking-widest">🔥 Hot</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-black text-amber-700">{warmthBreakdown.warm}</span>
                    <span className="text-[10px] text-[#131218]/45 uppercase tracking-widest">Warm</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-black text-[#131218]/50">{warmthBreakdown.cooling}</span>
                    <span className="text-[10px] text-[#131218]/45 uppercase tracking-widest">Cooling</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[18px] font-black text-[#131218]/30">{warmthBreakdown.cold}</span>
                    <span className="text-[10px] text-[#131218]/45 uppercase tracking-widest">Cold</span>
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/45 mb-3">
                  Strongest CH relationships
                </p>
                {strongestRel.length === 0 ? (
                  <p className="text-[11.5px] text-[#131218]/40 italic">No co-attended meetings recorded yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {strongestRel.map(r => (
                      <li key={r.email} className="flex items-center gap-3 text-[12px]">
                        <span className="flex-1 truncate text-[#131218]">{r.display_name ?? r.email.split("@")[0]}</span>
                        <span className="text-[10.5px] text-[#131218]/50 tabular-nums shrink-0">
                          🎙️ {r.shared_touches} shared
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
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Pipeline at {name}</h2>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[10px] text-[#131218]/40 tabular-nums">{crossRef.opportunities.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {crossRef.opportunities.map(o => (
                  <Link
                    key={o.id}
                    href={`/admin/opportunities?highlight=${encodeURIComponent(o.id)}`}
                    prefetch={false}
                    className="flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors"
                  >
                    <span className="text-[15px] leading-none mt-0.5">💼</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[#131218] truncate">{o.title}</p>
                      <p className="text-[10.5px] text-[#131218]/50 mt-0.5">
                        {o.status && <span className="uppercase tracking-wide font-bold">{o.status}</span>}
                        {o.opportunity_score != null && <span> · score {Math.round(o.opportunity_score)}</span>}
                        {o.probability != null && <span> · {Math.round(o.probability * 100)}%</span>}
                        {o.value_estimate != null && o.value_estimate > 0 && <span> · {formatValue(o.value_estimate)}</span>}
                        {o.expected_close_date && <span> · close {formatWhen(o.expected_close_date)}</span>}
                      </p>
                      {o.suggested_next_step && (
                        <p className="text-[10.5px] text-[#131218]/60 mt-0.5 truncate italic">→ {o.suggested_next_step}</p>
                      )}
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30 shrink-0 self-center">
                      Open →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Project cross-reference */}
          {crossRef.projects.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Projects involving {name}</h2>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[10px] text-[#131218]/40 tabular-nums">{crossRef.projects.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {crossRef.projects.map(p => (
                  <div key={p.id} className="px-5 py-3.5">
                    <div className="flex items-start gap-4">
                      <span className="text-[15px] leading-none mt-0.5">◧</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-[#131218] truncate">{p.name}</p>
                        <p className="text-[10.5px] text-[#131218]/50 mt-0.5">
                          {p.project_status && <span className="uppercase tracking-wide font-bold">{p.project_status}</span>}
                          {p.current_stage && <span> · {p.current_stage}</span>}
                          {p.last_meeting_date && <span> · last meeting {timeAgo(p.last_meeting_date)}</span>}
                        </p>
                        {p.hall_current_focus && (
                          <p className="text-[10.5px] text-[#131218]/60 mt-0.5 truncate italic">→ {p.hall_current_focus}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Classification editor (server-side data, client-side chips) */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Classification</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <HallOrganizationTagEditor
                domain={domain}
                currentClasses={org?.relationship_classes ?? []}
                currentName={org?.name ?? null}
                notion_id={org?.notion_id ?? null}
                contactCount={contacts.length}
                dismissed={!!org?.dismissed_at}
              />
              {org?.notes && (
                <p className="text-[11px] text-[#131218]/60 mt-3 italic">{org.notes}</p>
              )}
            </div>
          </section>

          {/* Contacts at this org */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Contacts at {name}</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <span className="text-[10px] font-semibold text-[#131218]/30">{contacts.length}</span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {contacts.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-[#131218]/25">No contacts observed at this domain yet.</p>
                </div>
              ) : contacts.map(c => (
                <HallContactRow
                  key={c.email}
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
              ))}
            </div>
          </section>

          {/* Cross-channel timeline */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Recent activity · last {timeline.length}</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
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

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
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

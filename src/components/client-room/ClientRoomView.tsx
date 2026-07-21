import { SignOutButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AgreementResponseActions } from "@/components/client-room/AgreementResponseActions";
import { DeckEmbed } from "@/components/client-room/DeckEmbed";
import { PdfEmbed } from "@/components/client-room/PdfEmbed";
import { SlidesEmbed } from "@/components/client-room/SlidesEmbed";
import { CopyButton } from "@/components/client-room/CopyButton";
import { BankReveal } from "@/components/client-room/BankReveal";
import { ClientBillingForm } from "@/components/client-room/ClientBillingForm";
import { RoomAnalytics } from "@/components/client-room/RoomAnalytics";

// Stable list of section ids the analytics tracker observes (must match the
// DOM ids rendered below). Module-level so the effect dependency stays stable.
const ROOM_SECTION_IDS = ["overview", "heard", "proposal", "plan", "together", "documents", "agreements", "admin"];
import type { ClientRole } from "@/lib/require-client-access";
import type { ClientRoomMaterial, ClientRoomProject } from "@/lib/client-room";

const CATEGORY_LABELS: Record<string, string> = {
  plan_timeline: "Plan", deliverable: "Entregable", presentation: "Presentación",
  manual: "Manual", working_document: "Documento", contract_agreement: "Contrato",
  proposal_budget: "Propuesta", purchase_order: "Orden de compra", invoice: "Factura",
  multimedia: "Multimedia", other: "Otro",
};

const TIMELINE_KIND_LABELS: Record<string, string> = {
  meeting: "Reunión", milestone: "Hito", document: "Documento", exchange: "Intercambio",
};

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function KindIcon({ kind }: { kind: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glyphs: Record<string, ReactNode> = {
    meeting: <><rect x="2.5" y="5" width="9" height="8" rx="1.5" {...p} /><path d="M11.5 8.3l3.5-2v5.4l-3.5-2z" {...p} /></>,
    document: <><path d="M4.5 2.5h5l4 4v9h-9z" {...p} /><path d="M9.5 2.5v4h4" {...p} /><path d="M6.5 9.5h5M6.5 12h5" {...p} /></>,
    milestone: <><path d="M5 2.5v13" {...p} /><path d="M5 3.5h8l-2 3 2 3H5" {...p} /></>,
    exchange: <><path d="M3 6.5h10l-2.5-2.5" {...p} /><path d="M15 11.5H5l2.5 2.5" {...p} /></>,
  };
  return <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true" style={{ display: "block" }}>{glyphs[kind] ?? glyphs.milestone}</svg>;
}

function isEmbeddableHtml(url: string) {
  return url.startsWith("/mps-deck/") || url.startsWith("/decks/");
}
function isPdf(m: ClientRoomMaterial) {
  return m.mimeType === "application/pdf" || (m.mimeType == null && m.url.toLowerCase().endsWith(".pdf"));
}
function slidesId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function isSlides(m: ClientRoomMaterial) {
  return slidesId(m.url) !== null;
}

function Card({ id, title, flourish, meta, children }: { id?: string; title: string; flourish?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 hall-room-card" style={{ background: "var(--hall-paper-0)", border: "1px solid var(--hall-line)", borderRadius: 14, padding: "20px 22px" }}>
      <div className="flex items-baseline justify-between gap-3 pb-2.5 mb-4" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">{title}{flourish && <> <em className="hall-room-flourish">{flourish}</em></>}</h2>
        {meta && <span className="text-[10px] uppercase tracking-[0.06em] shrink-0" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function StatIcon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glyphs: Record<string, ReactNode> = {
    stage: <><path d="M9 2.5l6 3-6 3-6-3z" {...p} /><path d="M3 9l6 3 6-3" {...p} /></>,
    milestone: <><circle cx="9" cy="9" r="5.5" {...p} /><circle cx="9" cy="9" r="1.8" {...p} /></>,
    work: <><rect x="2.5" y="5" width="9" height="8" rx="1.5" {...p} /><path d="M11.5 8.3l3.5-2v5.4l-3.5-2z" {...p} /></>,
  };
  return <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true" style={{ display: "block" }}>{glyphs[name] ?? glyphs.stage}</svg>;
}

function Stat({ label, value, sub, flag, icon, span }: { label: string; value: string; sub?: string; flag?: boolean; icon?: string; span?: boolean }) {
  return (
    <div className={`p-4 sm:p-[18px]${span ? " col-span-2" : ""}`} style={{ background: flag ? "var(--hall-lime-paper)" : "var(--hall-paper-0)", borderTop: "3px solid var(--hall-lime)" }}>
      <div className="flex items-center gap-1.5" style={{ color: flag ? "var(--hall-lime-ink)" : "var(--hall-muted-2)" }}>
        {icon && <StatIcon name={icon} />}
        <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)" }}>{label}</p>
      </div>
      <p className="text-[16px] sm:text-[18px] font-semibold mt-2 leading-[1.25]">{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: "var(--hall-muted)" }}>{sub}</p>}
    </div>
  );
}

export function ClientRoomView({ room, role, adminPreview }: { room: ClientRoomProject; role: ClientRole | null; adminPreview: boolean }) {
  const canRespondTo = (agreementType: string) => role === "approver" || (
    role === "collaborator" && agreementType !== "commercial" && agreementType !== "purchase_order"
  );
  const openAgreements = room.agreements.filter((item) => item.status === "shared" || item.status === "changes_requested");
  const understandingAgreements = room.agreements.filter((item) => item.agreementType === "understanding");
  const otherAgreements = room.agreements.filter((item) => item.agreementType !== "understanding");
  const documents = room.materials.filter((item) => !["invoice", "purchase_order", "proposal_budget"].includes(item.category));
  const adminMaterials = room.materials.filter((item) => ["invoice", "purchase_order"].includes(item.category));
  const b = room.billing;
  const billingLines = [b.legalName, b.companyNumber ? `N.º de registro: ${b.companyNumber}` : null, b.vatNumber ? `VAT: ${b.vatNumber}` : null, b.address, b.billingEmail ? `Facturación: ${b.billingEmail}` : null].filter((x): x is string => !!x);
  const hasCompany = billingLines.length > 0;
  const copyText = hasCompany ? billingLines.join("\n") : "";
  const hasBank = b.bankAccounts.length > 0;
  const canEditBilling = role === "collaborator" || role === "approver" || adminPreview;
  const cb = room.clientBilling;
  const hasClientBilling = !!cb && [cb.legalName, cb.taxId, cb.address, cb.billingEmail, cb.billingContact, cb.poReference, cb.notes].some(Boolean);
  const showClientBilling = canEditBilling || hasClientBilling;
  const hasPayInfo = hasCompany || hasBank || !!b.publicNote;
  const hasAdmin = hasPayInfo || adminMaterials.length > 0 || showClientBilling;
  const presentations = room.materials.filter((m) => m.category === "presentation" && (isEmbeddableHtml(m.url) || isPdf(m) || isSlides(m)));
  // The room preview (hero) is the presentation marked 'current'; fall back to any
  // non-superseded, then the newest. Only one deck is ever featured.
  const featured = presentations.find((m) => m.documentStatus === "current")
    ?? presentations.find((m) => m.documentStatus !== "superseded")
    ?? presentations[0];
  const previousVersions = room.materials.filter((m) => m.category === "presentation" && m.documentStatus === "superseded" && m.id !== featured?.id);
  const heardFields = [
    ["El reto", room.whatWeHeard.challenge],
    ["Lo que más importa", room.whatWeHeard.mattersMost],
    ["Lo que puede estorbar", room.whatWeHeard.obstacles],
    ["Cómo se ve el éxito", room.whatWeHeard.success],
  ].filter((item): item is [string, string] => !!item[1]);

  const meetings = room.timelineEvents.filter((e) => e.kind === "meeting").length;
  const earliest = room.timelineEvents.length ? room.timelineEvents[room.timelineEvents.length - 1].eventDate : null;
  const workValue = room.timelineEvents.length
    ? `${meetings} ${meetings === 1 ? "reunión" : "reuniones"} · ${room.timelineEvents.length} interacciones`
    : "Por comenzar";

  const navItems: Array<[string, string]> = [
    ["overview", "Resumen"], ["together", "Trabajo juntos"], ["proposal", "Propuesta"],
    ["heard", "Lo que escuchamos"], ["agreements", "Acuerdos"], ["plan", "Plan"], ["documents", "Documentos"], ["admin", "Administrativo"],
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--hall-paper-1)", color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-sans)" }}>
      <RoomAnalytics projectId={room.id} sectionIds={ROOM_SECTION_IDS} />
      <header className="px-4 sm:px-8 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--hall-ink-0)", background: "var(--hall-paper-0)" }}>
        <div className="flex items-center gap-4 min-w-0"><BrandLogo variant="black" height={28} /><span className="hidden sm:inline text-[10px] uppercase tracking-[0.08em] truncate" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.roomLabel} · {room.name}</span></div>
        <div className="flex items-center gap-3">
          {adminPreview && <span className="hall-chip-dark">Admin preview</span>}
          <SignOutButton><button type="button" className="hall-btn-ghost">Salir →</button></SignOutButton>
        </div>
      </header>

      <nav className="px-4 sm:px-8 overflow-x-auto" style={{ borderBottom: "1px solid var(--hall-line)", background: "var(--hall-paper-2)" }}>
        <div className="max-w-6xl mx-auto flex gap-5 min-w-max text-[11px] font-semibold hall-room-links">
          {navItems.map(([href, label]) => <a key={href} href={`#${href}`} className="py-3.5 hover:underline">{label}{href === "agreements" && openAgreements.length > 0 ? ` ${openAgreements.length}` : ""}</a>)}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
        <section id="overview" className="scroll-mt-24 pt-10 sm:pt-12 pb-2 hall-room-fade">
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-5 sm:gap-8">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.organizationName ?? "Common House"} · {room.currentStage ?? room.projectStatus ?? room.roomStatus}</p>
              <h1 className="text-[38px] sm:text-[52px] leading-[1] tracking-[-0.025em]" style={{ fontFamily: "var(--font-hall-display)", fontWeight: 400 }}>{room.name}<span style={{ color: "var(--hall-lime)" }}>_</span></h1>
              {room.welcomeNote && <p className="mt-4 max-w-2xl text-[15px] leading-[1.6]" style={{ color: "var(--hall-muted-2)" }}>{room.welcomeNote}</p>}
            </div>
            {room.clientLogoUrl && (
              <div className="shrink-0 flex items-center justify-center sm:min-w-[260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={room.clientLogoUrl} alt={room.organizationName ?? "Client"} style={{ height: 132, width: "auto", maxWidth: 240 }} />
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 mt-6 mb-2 hall-room-fade" style={{ gap: 1, background: "var(--hall-line)", border: "1px solid var(--hall-line)", borderRadius: 14, overflow: "hidden" }}>
          <Stat icon="stage" label="Etapa" value={room.currentStage ?? room.projectStatus ?? room.roomStatus} sub={room.currentFocus ?? undefined} />
          <Stat icon="milestone" label="Próximo hito" value={room.nextMilestone || "Por confirmar"} />
          <Stat icon="work" span label="Trabajo dedicado" value={workValue} sub={earliest ? `Desde ${displayDate(earliest)}` : undefined} />
        </section>

        {(understandingAgreements.length > 0 || heardFields.length > 0 || room.whatWeHeard.heard.length > 0) && (
          <section id="heard" className="scroll-mt-24 mt-5 hall-room-fade" style={{ background: "var(--hall-paper-0)", border: "1px solid var(--hall-ink-0)", borderRadius: 16, borderTop: "4px solid var(--hall-lime)", padding: "26px 28px" }}>
            <div className="flex items-baseline justify-between gap-3 pb-3 mb-6" style={{ borderBottom: "1px solid var(--hall-line)" }}>
              <h2 className="text-[20px] sm:text-[26px] font-bold tracking-[-0.015em]">Lo que <em className="hall-room-flourish">escuchamos</em></h2>
              <span className="text-[10px] uppercase tracking-[0.06em] shrink-0" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>Síntesis del análisis</span>
            </div>
            {understandingAgreements.map((a) => a.summary && <p key={a.id} className="text-[15px] leading-[1.7] max-w-3xl mb-6" style={{ whiteSpace: "pre-line" }}>{a.summary}</p>)}
            {heardFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-7 gap-y-6">
                {heardFields.map(([label, value]) => (
                  <div key={label} className="pt-3" style={{ borderTop: "2px solid var(--hall-lime)" }}>
                    <p className="text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-lime-ink)" }}>{label}</p>
                    <p className="text-[13.5px] leading-[1.6]">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {room.whatWeHeard.heard.length > 0 && (
              <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                <p className="text-[10px] uppercase tracking-[0.07em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>De la conversación</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                  {room.whatWeHeard.heard.map((item, index) => <p key={`${item.point}-${index}`} className="text-[13.5px] leading-[1.55]">{item.point}{item.speakerName && <span style={{ color: "var(--hall-muted-3)" }}> — {item.speakerName}</span>}</p>)}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 items-start mt-5">
          <div className="flex flex-col gap-5">
            <Card id="proposal" title="Nuestra" flourish="propuesta" meta={room.proposal.status}>
              {featured && <div className="mb-4">{
                isPdf(featured) ? <PdfEmbed url={featured.url} title={featured.title} />
                : isSlides(featured) ? <SlidesEmbed embedUrl={`https://docs.google.com/presentation/d/${slidesId(featured.url)}/embed?start=false&loop=false&rm=minimal`} openUrl={featured.url} title={featured.title} />
                : <DeckEmbed url={featured.url} title={featured.title} />
              }</div>}
              <p className="text-[14px] leading-[1.6] max-w-2xl">{room.proposal.summary || "La propuesta se está preparando a partir de lo que escuchamos."}</p>
              {!featured && room.proposal.file_url && <a className="hall-btn-primary inline-flex mt-4" href={room.proposal.file_url} target="_blank" rel="noreferrer">Abrir {room.proposal.file_name || "propuesta"} ↗</a>}
              {previousVersions.length > 0 && (
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                  <p className="text-[10px] uppercase tracking-[0.07em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Versiones anteriores</p>
                  {previousVersions.map((m) => (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`version:${m.title}`} className="flex items-center justify-between gap-3 py-1.5 hover:opacity-70">
                      <span className="text-[12.5px]" style={{ color: "var(--hall-muted-2)" }}>{m.title}</span>
                      <span className="text-[10.5px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}>{m.versionLabel || "anterior"} ↗</span>
                    </a>
                  ))}
                </div>
              )}
            </Card>

            <Card id="plan" title="Plan" flourish="y progreso" meta={room.timeline.length ? `${room.timeline.length} hitos` : undefined}>
              {room.timeline.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>El primer plan aparecerá aquí.</p> : <div>{room.timeline.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[84px_1fr_auto] gap-3 items-center py-2.5" style={{ borderBottom: index === room.timeline.length - 1 ? "none" : "1px solid var(--hall-line-soft)" }}><span className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{item.date || "—"}</span><strong className="text-[13.5px] font-medium">{item.label}</strong><span className="hall-chip-outline">{item.type}</span></div>)}</div>}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card id="together" title="Nuestro" flourish="trabajo juntos" meta="Registro">
              {room.timelineEvents.length === 0
                ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Reuniones, documentos e hitos aparecerán aquí.</p>
                : <div>{room.timelineEvents.map((ev, index) => {
                    const last = index === room.timelineEvents.length - 1;
                    return (
                      <div key={ev.id} className="relative pl-7 pb-4" style={{ borderLeft: last ? "1px solid transparent" : "1px solid var(--hall-line)" }}>
                        <span className="absolute flex items-center justify-center rounded-full" style={{ left: -11, top: 0, width: 22, height: 22, background: "var(--hall-paper-0)", border: "1px solid var(--hall-line-strong)", color: "var(--hall-ink-0)" }}><KindIcon kind={ev.kind} /></span>
                        <p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{displayDate(ev.eventDate)} · {TIMELINE_KIND_LABELS[ev.kind] ?? ev.kind}</p>
                        <p className="text-[13px] font-semibold mt-0.5">{ev.title}</p>
                        {ev.attendees.length > 0 && <p className="text-[10.5px] mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{ev.attendees.join("  ·  ")}</p>}
                      </div>
                    );
                  })}</div>}
            </Card>

            <Card id="documents" title="Documentos" meta={documents.length || undefined}>
              {documents.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Nada compartido aún.</p> : <div>{documents.map((m, i) => <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`doc:${m.title}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-70" style={{ borderBottom: i === documents.length - 1 ? "none" : "1px solid var(--hall-line-soft)" }}><div className="min-w-0"><p className="text-[13px] font-semibold truncate">{m.title}</p><p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{CATEGORY_LABELS[m.category] ?? m.category}{m.versionLabel ? ` · ${m.versionLabel}` : ""}</p></div><span aria-hidden="true" style={{ color: "var(--hall-muted)" }}>↗</span></a>)}</div>}
            </Card>

            <Card id="agreements" title="Acuerdos" meta={otherAgreements.length || undefined}>
              {otherAgreements.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Las decisiones y siguientes pasos aparecerán aquí.</p> : <div className="space-y-4">{otherAgreements.map((agreement) => <article key={agreement.id} style={(agreement.status === "shared" || agreement.status === "changes_requested") ? { background: "var(--hall-lime-paper)", border: "1px solid var(--hall-lime)", borderRadius: 10, padding: "12px 14px" } : undefined}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.07em] mb-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{agreement.agreementType.replaceAll("_", " ")} · v{agreement.version}</p><h3 className="text-[14px] font-bold">{agreement.title}</h3>{agreement.summary && <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{agreement.summary}</p>}</div><span className="hall-chip-outline shrink-0">{agreement.status.replaceAll("_", " ")}</span></div>{(agreement.status === "shared" || agreement.status === "changes_requested") && <AgreementResponseActions agreementId={agreement.id} version={agreement.version} agreementType={agreement.agreementType} canRespond={canRespondTo(agreement.agreementType)} />}{agreement.respondedAt && <p className="mt-2 text-[10px]" style={{ color: "var(--hall-muted-3)" }}>Respondido {displayDate(agreement.respondedAt)}{agreement.respondedEmail ? ` · ${agreement.respondedEmail}` : ""}</p>}</article>)}</div>}
            </Card>

            <Card id="admin" title="Administrativo">
              {!hasAdmin
                ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Aquí verás la facturación y los datos de pago.</p>
                : <div className="space-y-4">
                    {(hasCompany || hasBank || b.publicNote) && (
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Datos de pago</p>
                          {copyText && <CopyButton text={copyText} label="Copiar todo" />}
                        </div>
                        {hasCompany && <div className="text-[13px] leading-[1.6]" style={{ whiteSpace: "pre-line" }}>{["Common House", ...billingLines].join("\n")}</div>}
                        {hasBank && <BankReveal accounts={b.bankAccounts} />}
                        {b.publicNote && <p className="mt-2 text-[11px]" style={{ color: "var(--hall-muted)" }}>{b.publicNote}</p>}
                      </div>
                    )}
                    {adminMaterials.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.07em] mb-1" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Facturación</p>
                        {adminMaterials.map((m, i) => <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`admin-doc:${m.title}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-70" style={{ borderBottom: i === adminMaterials.length - 1 ? "none" : "1px solid var(--hall-line-soft)" }}><div className="min-w-0"><p className="text-[13px] font-semibold truncate">{m.title}</p><p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{CATEGORY_LABELS[m.category] ?? m.category}{m.versionLabel ? ` · ${m.versionLabel}` : ""}</p></div><span aria-hidden="true" style={{ color: "var(--hall-muted)" }}>↗</span></a>)}
                      </div>
                    )}
                    {showClientBilling && (
                      <div style={{ borderTop: hasPayInfo || adminMaterials.length > 0 ? "1px solid var(--hall-line-soft)" : undefined, paddingTop: hasPayInfo || adminMaterials.length > 0 ? 16 : 0 }}>
                        <p className="text-[10px] uppercase tracking-[0.07em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Tus datos de facturación</p>
                        <ClientBillingForm projectId={room.id} profile={cb} canEdit={canEditBilling} />
                      </div>
                    )}
                  </div>}
            </Card>
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-8 py-7" style={{ borderTop: "1px solid var(--hall-ink-0)", background: "var(--hall-paper-0)" }}><div className="max-w-6xl mx-auto flex flex-wrap justify-between gap-3 text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}><span>Preparado por Common House</span><span className="flex items-center gap-4">Confidencial{room.organizationName ? ` · ${room.organizationName}` : ""}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/isotipo-lime.png" alt="" style={{ height: 22, width: "auto" }} /></span></div></footer>
    </div>
  );
}

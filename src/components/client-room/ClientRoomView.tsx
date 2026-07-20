import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AgreementResponseActions } from "@/components/client-room/AgreementResponseActions";
import { DeckEmbed } from "@/components/client-room/DeckEmbed";
import { isEmbeddableDeckUrl, proposalDeckIndexPath } from "@/lib/deck-embed";
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

function Card({ id, title, flourish, meta, children }: { id?: string; title: string; flourish?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24" style={{ background: "var(--hall-paper-0)", border: "1px solid var(--hall-line)", borderRadius: 14, padding: "20px 22px" }}>
      <div className="flex items-baseline justify-between gap-3 pb-2.5 mb-4" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">{title}{flourish && <> <em style={{ fontFamily: "var(--font-hall-display)", fontWeight: 400 }}>{flourish}</em></>}</h2>
        {meta && <span className="text-[10px] uppercase tracking-[0.06em] shrink-0" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, flag }: { label: string; value: string; sub?: string; flag?: boolean }) {
  return (
    <div className="p-4 sm:p-[18px]" style={{ background: flag ? "var(--hall-warn-paper)" : "var(--hall-paper-0)" }}>
      <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{label}</p>
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
  // The deck bytes are NOT served from the material url (which points at the
  // private bundle name); they are served only through the Client-Room-gated
  // /proposal-deck/<slug> route. Embed that protected URL, never the raw asset.
  const deckMaterial = room.materials.find((m) => m.category === "presentation" && isEmbeddableDeckUrl(m.url));
  const deckSrc = deckMaterial && room.slug ? proposalDeckIndexPath(room.slug) : null;
  // The embeddable deck is rendered as the embed above; keep it out of the
  // documents list so its raw (gated) bundle url is never surfaced as a link.
  const documents = room.materials.filter((item) => !["invoice", "purchase_order", "proposal_budget"].includes(item.category) && item !== deckMaterial);
  const commercialMaterials = room.materials.filter((item) => ["invoice", "purchase_order", "proposal_budget"].includes(item.category));
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
    ["heard", "Lo que escuchamos"], ["agreements", "Acuerdos"], ["plan", "Plan"], ["documents", "Documentos"],
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--hall-paper-1)", color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-sans)" }}>
      <header className="px-4 sm:px-8 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--hall-ink-0)", background: "var(--hall-paper-0)" }}>
        <div className="flex items-center gap-4 min-w-0"><BrandLogo variant="black" height={28} /><span className="hidden sm:inline text-[10px] uppercase tracking-[0.08em] truncate" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.roomLabel} · {room.name}</span></div>
        <div className="flex items-center gap-3">
          {adminPreview && <span className="hall-chip-dark">Admin preview</span>}
          <SignOutButton><button type="button" className="hall-btn-ghost">Salir →</button></SignOutButton>
        </div>
      </header>

      <nav className="px-4 sm:px-8 overflow-x-auto" style={{ borderBottom: "1px solid var(--hall-line)", background: "var(--hall-paper-2)" }}>
        <div className="max-w-6xl mx-auto flex gap-5 min-w-max text-[11px] font-semibold">
          {navItems.map(([href, label]) => <a key={href} href={`#${href}`} className="py-3.5 hover:underline">{label}{href === "agreements" && openAgreements.length > 0 ? ` ${openAgreements.length}` : ""}</a>)}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
        <section id="overview" className="scroll-mt-24 pt-10 sm:pt-12 pb-2">
          <p className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.organizationName ?? "Common House"} · {room.currentStage ?? room.projectStatus ?? room.roomStatus}</p>
          <h1 className="text-[38px] sm:text-[52px] leading-[1] tracking-[-0.025em]" style={{ fontFamily: "var(--font-hall-display)", fontWeight: 400 }}>{room.name}</h1>
          {room.welcomeNote && <p className="mt-4 max-w-2xl text-[15px] leading-[1.6]" style={{ color: "var(--hall-muted-2)" }}>{room.welcomeNote}</p>}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 mt-6 mb-2" style={{ gap: 1, background: "var(--hall-line)", border: "1px solid var(--hall-line)", borderRadius: 14, overflow: "hidden" }}>
          <Stat label="Etapa" value={room.currentStage ?? room.projectStatus ?? room.roomStatus} sub={room.currentFocus ?? undefined} />
          <Stat label="Próximo hito" value={room.nextMilestone || "Por confirmar"} />
          <Stat label="Necesita tu input" value={openAgreements.length === 0 ? "Nada abierto" : `${openAgreements.length} acuerdo${openAgreements.length === 1 ? "" : "s"}`} flag={openAgreements.length > 0} />
          <Stat label="Trabajo dedicado" value={workValue} sub={earliest ? `Desde ${displayDate(earliest)}` : undefined} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 items-start mt-5">
          <div className="flex flex-col gap-5">
            <Card id="proposal" title="Nuestra" flourish="propuesta" meta={room.proposal.status}>
              {deckSrc && deckMaterial && <div className="mb-4"><DeckEmbed url={deckSrc} title={deckMaterial.title} /></div>}
              <p className="text-[14px] leading-[1.6] max-w-2xl">{room.proposal.summary || "La propuesta se está preparando a partir de lo que escuchamos."}</p>
              {!deckSrc && room.proposal.file_url && <a className="hall-btn-primary inline-flex mt-4" href={room.proposal.file_url} target="_blank" rel="noreferrer">Abrir {room.proposal.file_name || "propuesta"} ↗</a>}
            </Card>

            <Card id="heard" title="Lo que" flourish="escuchamos">
              {understandingAgreements.length === 0 && heardFields.length === 0 && room.whatWeHeard.heard.length === 0
                ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Common House está preparando la primera síntesis.</p>
                : <div className="space-y-6">
                    {understandingAgreements.map((a) => a.summary && <p key={a.id} className="text-[14px] leading-[1.7] max-w-2xl" style={{ whiteSpace: "pre-line" }}>{a.summary}</p>)}
                    {(heardFields.length > 0 || room.whatWeHeard.heard.length > 0) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                      {heardFields.map(([label, value]) => <div key={label}><p className="text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{label}</p><p className="text-[13.5px] leading-[1.55]">{value}</p></div>)}
                      {room.whatWeHeard.heard.map((item, index) => <div key={`${item.point}-${index}`}><p className="text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>De la conversación</p><p className="text-[13.5px] leading-[1.55]">{item.point}</p>{item.speakerName && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-muted-3)" }}>— {item.speakerName}</p>}</div>)}
                    </div>}
                  </div>}
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
                    const dot = ev.kind === "document" ? "var(--hall-ok)" : ev.kind === "meeting" ? "var(--hall-warn)" : "var(--hall-ink-0)";
                    return (
                      <div key={ev.id} className="relative pl-5 pb-4" style={{ borderLeft: last ? "1px solid transparent" : "1px solid var(--hall-line)" }}>
                        <span className="absolute rounded-full" style={{ left: -5, top: 3, width: 9, height: 9, background: dot }} />
                        <p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{displayDate(ev.eventDate)} · {TIMELINE_KIND_LABELS[ev.kind] ?? ev.kind}</p>
                        <p className="text-[13px] font-semibold mt-0.5">{ev.title}</p>
                        {ev.attendees.length > 0 && <p className="text-[10.5px] mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{ev.attendees.join("  ·  ")}</p>}
                      </div>
                    );
                  })}</div>}
            </Card>

            <Card id="documents" title="Documentos" meta={documents.length || undefined}>
              {documents.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Nada compartido aún.</p> : <div>{documents.map((m, i) => <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-2.5 hover:opacity-70" style={{ borderBottom: i === documents.length - 1 ? "none" : "1px solid var(--hall-line-soft)" }}><div className="min-w-0"><p className="text-[13px] font-semibold truncate">{m.title}</p><p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{CATEGORY_LABELS[m.category] ?? m.category}{m.versionLabel ? ` · ${m.versionLabel}` : ""}</p></div><span aria-hidden="true" style={{ color: "var(--hall-muted)" }}>↗</span></a>)}</div>}
            </Card>

            <Card id="agreements" title="Acuerdos" meta={otherAgreements.length || undefined}>
              {otherAgreements.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Las decisiones y siguientes pasos aparecerán aquí.</p> : <div className="space-y-4">{otherAgreements.map((agreement) => <article key={agreement.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.07em] mb-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{agreement.agreementType.replaceAll("_", " ")} · v{agreement.version}</p><h3 className="text-[14px] font-bold">{agreement.title}</h3>{agreement.summary && <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{agreement.summary}</p>}</div><span className="hall-chip-outline shrink-0">{agreement.status.replaceAll("_", " ")}</span></div>{(agreement.status === "shared" || agreement.status === "changes_requested") && <AgreementResponseActions agreementId={agreement.id} version={agreement.version} agreementType={agreement.agreementType} canRespond={canRespondTo(agreement.agreementType)} />}{agreement.respondedAt && <p className="mt-2 text-[10px]" style={{ color: "var(--hall-muted-3)" }}>Respondido {displayDate(agreement.respondedAt)}{agreement.respondedEmail ? ` · ${agreement.respondedEmail}` : ""}</p>}</article>)}</div>}
            </Card>

            {(commercialMaterials.length > 0 || room.agreements.some((i) => i.agreementType === "commercial" || i.agreementType === "purchase_order")) && (
              <Card title="Comercial" meta={commercialMaterials.length || undefined}>
                {commercialMaterials.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Propuestas, órdenes y facturas aparecerán aquí.</p> : <div>{commercialMaterials.map((m, i) => <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-2.5 hover:opacity-70" style={{ borderBottom: i === commercialMaterials.length - 1 ? "none" : "1px solid var(--hall-line-soft)" }}><div className="min-w-0"><p className="text-[13px] font-semibold truncate">{m.title}</p><p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{CATEGORY_LABELS[m.category] ?? m.category}</p></div><span aria-hidden="true" style={{ color: "var(--hall-muted)" }}>↗</span></a>)}</div>}
              </Card>
            )}
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-8 py-7" style={{ borderTop: "1px solid var(--hall-ink-0)", background: "var(--hall-paper-0)" }}><div className="max-w-6xl mx-auto flex flex-wrap justify-between gap-3 text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}><span>Preparado por Common House</span><span><Link href="/trust">Confianza</Link> · <Link href="/status">Estado</Link> · <Link href="/security">Seguridad</Link></span></div></footer>
    </div>
  );
}

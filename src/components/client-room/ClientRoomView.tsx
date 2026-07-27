import type { ReactNode } from "react";
import { AgreementResponseActions } from "@/components/client-room/AgreementResponseActions";
import { DeckEmbed } from "@/components/client-room/DeckEmbed";
import { PdfEmbed } from "@/components/client-room/PdfEmbed";
import { SlidesEmbed } from "@/components/client-room/SlidesEmbed";
import { CopyButton } from "@/components/client-room/CopyButton";
import { BankReveal } from "@/components/client-room/BankReveal";
import { ClientBillingForm } from "@/components/client-room/ClientBillingForm";
import { RoomAnalytics } from "@/components/client-room/RoomAnalytics";
import { LobbyShell, type LobbyNavItem } from "@/components/client-room/LobbyShell";
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

const ROOM_SECTION_IDS = ["overview", "heard", "proposal", "plan", "together", "documents", "agreements", "admin"];

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

/** "hace 7 días" — cuando el punto es "esto se movió", la frescura dice más que
 *  la fecha exacta. Bajo un día, hoy/ayer; sobre dos meses, la fecha. */
function relativeDate(value: string | null): string | null {
  if (!value) return null;
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 60) return `hace ${days} días`;
  return displayDate(value);
}

function KindIcon({ kind }: { kind: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glyphs: Record<string, ReactNode> = {
    meeting: <><rect x="2.5" y="5" width="9" height="8" rx="1.5" {...p} /><path d="M11.5 8.3l3.5-2v5.4l-3.5-2z" {...p} /></>,
    document: <><path d="M4.5 2.5h5l4 4v9h-9z" {...p} /><path d="M9.5 2.5v4h4" {...p} /><path d="M6.5 9.5h5M6.5 12h5" {...p} /></>,
    milestone: <><path d="M5 2.5v13" {...p} /><path d="M5 3.5h8l-2 3 2 3H5" {...p} /></>,
    exchange: <><path d="M3 6.5h10l-2.5-2.5" {...p} /><path d="M15 11.5H5l2.5 2.5" {...p} /></>,
  };
  return <svg width="13" height="13" viewBox="0 0 18 18" aria-hidden="true" style={{ display: "block" }}>{glyphs[kind] ?? glyphs.milestone}</svg>;
}

const HEAD_ICONS: Record<string, ReactNode> = {
  heard: <path d="M13.5 9.2c0 .9-.7 1.6-1.6 1.6H6.4L3.2 13.2V4.4c0-.9.7-1.6 1.6-1.6h7.1c.9 0 1.6.7 1.6 1.6z" />,
  proposal: <><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5 8 11.5 14 8.5" /></>,
  plan: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11" /><path d="M5.5 2v3M10.5 2v3" /></>,
  together: <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.8V8l2.2 1.3" /></>,
  agreements: <><path d="M4 14V2.5" /><path d="M4 3.2h7.5l-1.7 2.4 1.7 2.4H4" /></>,
  documents: <path d="M2.5 5.4c0-.8.6-1.4 1.4-1.4h2.1l1.4 1.5h4.7c.8 0 1.4.6 1.4 1.4v4.9c0 .8-.6 1.4-1.4 1.4H3.9c-.8 0-1.4-.6-1.4-1.4z" />,
  admin: <><circle cx="8" cy="8" r="5.5" /><path d="M8 7.4v3.3M8 5.2v.1" /></>,
};

function HeadIcon({ name }: { name: string }) {
  return (
    <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--lobby-lime)", display: "grid", placeItems: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: 14, height: 14, stroke: "#000", fill: "none", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }}>
        {HEAD_ICONS[name] ?? HEAD_ICONS.documents}
      </svg>
    </span>
  );
}

function Card({ id, icon, title, meta, isNew, wash, children }: {
  id?: string; icon: string; title: string; meta?: ReactNode; isNew?: boolean; wash?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4" style={{ background: "var(--lobby-paper)", border: "1.5px solid var(--lobby-line)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 17px 12px", borderBottom: "1px solid var(--lobby-line)", background: wash ? "var(--lobby-lime-wash)" : undefined }}>
        <HeadIcon name={icon} />
        <b style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".2px", whiteSpace: "nowrap" }}>{title}</b>
        {isNew && <span className="lobby-label" style={{ color: "var(--lobby-lime-ink)", flex: "none" }}>· nuevo</span>}
        <span style={{ flex: 1 }} />
        {meta}
      </div>
      <div style={{ padding: "15px 17px 17px" }}>{children}</div>
    </section>
  );
}

/**
 * `*texto*` → itálica lime. Es la convención que ya usa la sala (`renderHero` en
 * RoomClient) y con la que están escritos `hall_current_focus` y compañía en la
 * base: sin esto el lobby imprime los asteriscos crudos ("Piloto de *reúso*").
 * Al converger las dos superficies, este helper es el que manda.
 */
function withEmphasis(text: string): ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, i) => (
    part.startsWith("*") && part.endsWith("*") && part.length > 2
      ? <em key={i} style={{ fontStyle: "italic", fontWeight: 800, color: "var(--lobby-lime-ink)" }}>{part.slice(1, -1)}</em>
      : <span key={i}>{part}</span>
  ));
}

function Stat({ label, value, sub, span, lime }: { label: string; value: string; sub?: string; span?: boolean; lime?: boolean }) {
  return (
    <div style={{ background: "var(--lobby-paper)", border: "1.5px solid var(--lobby-line)", borderRadius: 12, padding: "15px 16px", gridColumn: span ? "span 2" : undefined }}>
      <div className="lobby-label">{label}</div>
      <div style={{ fontSize: span ? "1.5rem" : "1.05rem", fontWeight: 900, letterSpacing: span ? "-1px" : "-.3px", marginTop: 8, lineHeight: 1.25, color: lime ? "var(--lobby-lime-ink)" : undefined }}>{withEmphasis(value)}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--lobby-muted)", marginTop: 4, fontWeight: 500 }}>{withEmphasis(sub)}</div>}
    </div>
  );
}

function Prov({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9.5, letterSpacing: ".4px", textTransform: "uppercase", color: "var(--lobby-muted)" }}>{children}</div>;
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

  const hasHeard = understandingAgreements.length > 0 || heardFields.length > 0 || room.whatWeHeard.heard.length > 0;
  const stage = room.currentStage ?? room.projectStatus ?? room.roomStatus;

  // El riel sólo nombra lo que existe. Una sección vacía en la nav promete un
  // lugar y entrega una frase gris: dentro del marco de app eso se lee como
  // producto a medio hacer, justo lo contrario de lo que el cromo quiere decir.
  const nav: LobbyNavItem[] = [
    { id: "overview", label: "Resumen", icon: "overview" },
    ...(hasHeard ? [{ id: "heard", label: "Lo que escuchamos", icon: "heard" }] : []),
    { id: "proposal", label: "Propuesta", icon: "proposal" },
    ...(room.timeline.length ? [{ id: "plan", label: "Plan", icon: "plan" }] : []),
    ...(room.timelineEvents.length ? [{ id: "together", label: "Trabajo juntos", icon: "together" }] : []),
    ...(otherAgreements.length
      ? [{ id: "agreements", label: "Acuerdos", icon: "agreements", ...(openAgreements.length ? { alert: openAgreements.length } : {}) }]
      : []),
    ...(documents.length ? [{ id: "documents", label: "Documentos", icon: "documents" }] : []),
    ...(hasAdmin ? [{ id: "admin", label: "Administrativo", icon: "admin" }] : []),
  ];

  // Sólo hay "te toca" si al que mira le toca de verdad: un lector no puede
  // responder nada, y decirle que le toca es ruido.
  const actionable = openAgreements.find((a) => canRespondTo(a.agreementType));
  const todo = actionable
    ? { label: `${actionable.status === "changes_requested" ? "Revisar" : "Responder"}: ${actionable.title}`, targetId: "agreements" }
    : null;

  const initials = [...new Set(room.timelineEvents.flatMap((e) => e.attendees))]
    .map((n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase())
    .filter((x) => x.length >= 2)
    .slice(0, 3);

  const featuredFresh = featured ? relativeDate(featured.clientVisibleAt ?? featured.modifiedAt) : null;

  return (
    <LobbyShell
      orgName={room.organizationName ?? "Common House"}
      roomLabel={room.roomLabel}
      stage={stage}
      nav={nav}
      soon={[
        { label: "Lo mío", icon: "mine" },
        { label: "Entregables", icon: "deliverables" },
        { label: "Tareas", icon: "tasks" },
        { label: "Decisiones", icon: "decisions" },
      ]}
      todo={todo}
      adminPreview={adminPreview}
      initials={initials}
    >
      <RoomAnalytics projectId={room.id} sectionIds={ROOM_SECTION_IDS} />

      {/* ── RESUMEN ── */}
      <section id="overview" className="scroll-mt-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-5 sm:gap-7">
          <div className="min-w-0 flex-1">
            <div className="lobby-label">{room.organizationName ?? "Common House"} · {stage}</div>
            {/* El lobby titula la relación, no el foco de la semana: por eso
                conserva el serif aunque el resto del cromo venga de la sala. */}
            <h1 style={{ fontFamily: "var(--font-hall-display), Georgia, serif", fontStyle: "italic", fontWeight: 400, fontSize: 42, letterSpacing: "-.02em", lineHeight: 1.05, maxWidth: "18ch", margin: "10px 0 0" }}>
              {room.name}<span style={{ color: "var(--lobby-lime)" }}>_</span>
            </h1>
            {room.welcomeNote && <p style={{ color: "var(--lobby-muted)", fontSize: 14, maxWidth: "64ch", margin: "12px 0 0", lineHeight: 1.6, whiteSpace: "pre-line" }}>{withEmphasis(room.welcomeNote)}</p>}
          </div>
          {room.clientLogoUrl && (
            <div className="shrink-0 flex items-center justify-center" style={{ width: 240 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={room.clientLogoUrl} alt={room.organizationName ?? "Client"} style={{ height: 132, width: "auto", maxWidth: 220 }} />
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginTop: 20 }}>
          <Stat label="Etapa" value={stage} sub={room.currentFocus ?? undefined} />
          <Stat label="Próximo hito" value={room.nextMilestone || "Por confirmar"} />
          <Stat span lime label="Trabajo dedicado" value={workValue} sub={earliest ? `Desde ${displayDate(earliest)}` : undefined} />
        </div>
      </section>

      {/* ── LO QUE ESCUCHAMOS ── */}
      {hasHeard && (
        <div style={{ marginTop: 16 }}>
          <Card id="heard" icon="heard" title="Lo que escuchamos" wash
            meta={<span style={{ fontSize: 10, color: "var(--lobby-muted)", fontWeight: 600 }}>Síntesis del análisis</span>}>
            {understandingAgreements.map((a) => a.summary && (
              <p key={a.id} style={{ fontSize: 14, lineHeight: 1.7, maxWidth: "70ch", marginBottom: 18, whiteSpace: "pre-line" }}>{a.summary}</p>
            ))}
            {heardFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 18 }}>
                {heardFields.map(([label, value]) => (
                  <div key={label} style={{ borderTop: "2px solid var(--lobby-lime)", paddingTop: 9 }}>
                    <div className="lobby-label" style={{ color: "var(--lobby-lime-ink)", marginBottom: 6 }}>{label}</div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            )}
            {room.whatWeHeard.heard.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--lobby-line-soft)" }}>
                <div className="lobby-label" style={{ marginBottom: 8 }}>De la conversación</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: "10px 28px" }}>
                  {room.whatWeHeard.heard.map((item, index) => (
                    <p key={`${item.point}-${index}`} style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                      {item.point}{item.speakerName && <span style={{ color: "var(--lobby-muted)" }}> — {item.speakerName}</span>}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]" style={{ gap: 16, alignItems: "start", marginTop: 16 }}>
        <div className="flex flex-col" style={{ gap: 16 }}>

          {/* ── PROPUESTA ── */}
          <Card id="proposal" icon="proposal" title="Nuestra propuesta"
            meta={<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--lobby-paper-2)", color: "var(--lobby-muted-2)" }}>{room.proposal.status}</span>}>
            {featured && (
              <>
                <Prov>
                  Compartido por {featured.sharedBy}
                  {featuredFresh ? ` · ${featuredFresh}` : ""}
                  {previousVersions.length > 0 ? " · reemplazó a la versión anterior" : ""}
                </Prov>
                <div style={{ marginTop: 10, marginBottom: 14 }}>
                  {isPdf(featured) ? <PdfEmbed url={featured.url} title={featured.title} />
                    : isSlides(featured) ? <SlidesEmbed embedUrl={`https://docs.google.com/presentation/d/${slidesId(featured.url)}/embed?start=false&loop=false&rm=minimal`} openUrl={featured.url} title={featured.title} />
                    : <DeckEmbed url={featured.url} title={featured.title} />}
                </div>
              </>
            )}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: "60ch", margin: 0 }}>{room.proposal.summary || "La propuesta se está preparando a partir de lo que escuchamos."}</p>
            {!featured && room.proposal.file_url && (
              <a className="lobby-btn-go inline-flex" style={{ marginTop: 14, textDecoration: "none" }} href={room.proposal.file_url} target="_blank" rel="noreferrer">
                Abrir {room.proposal.file_name || "propuesta"} ↗
              </a>
            )}
            {previousVersions.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--lobby-line-soft)" }}>
                <div className="lobby-label" style={{ marginBottom: 6 }}>Versiones anteriores</div>
                {previousVersions.map((m) => (
                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`version:${m.title}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", textDecoration: "none", color: "inherit" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lobby-muted-2)" }}>{m.title}</span>
                    <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--lobby-muted)" }}>{m.versionLabel || "anterior"} ↗</span>
                  </a>
                ))}
              </div>
            )}
          </Card>

          {/* ── PLAN ── */}
          {room.timeline.length > 0 && (
            <Card id="plan" icon="plan" title="Plan y progreso"
              meta={<span style={{ fontSize: 10, color: "var(--lobby-muted)", fontWeight: 600 }}>{room.timeline.length} hitos</span>}>
              {room.timeline.map((item, index) => (
                <div key={`${item.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: index === 0 ? "none" : "1px solid var(--lobby-line-soft)" }}>
                  <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--lobby-muted)", minWidth: 52, flex: "none" }}>{item.date || "—"}</span>
                  <strong style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>{item.label}</strong>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", background: item.type === "today" ? "var(--lobby-lime)" : "var(--lobby-paper-2)", color: item.type === "today" ? "#000" : "var(--lobby-muted-2)" }}>
                    {item.type === "today" ? "Hoy" : item.type}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="flex flex-col" style={{ gap: 16 }}>

          {/* ── TRABAJO JUNTOS ── */}
          {room.timelineEvents.length > 0 && (
            <Card id="together" icon="together" title="Nuestro trabajo juntos"
              meta={<span style={{ fontSize: 10, color: "var(--lobby-muted)", fontWeight: 600 }}>{room.timelineEvents.length}</span>}>
              {room.timelineEvents.map((ev, index) => {
                const last = index === room.timelineEvents.length - 1;
                return (
                  <div key={ev.id} style={{ position: "relative", paddingLeft: 26, paddingBottom: last ? 0 : 14, borderLeft: last ? "1px solid transparent" : "1px solid var(--lobby-line)" }}>
                    <span style={{ position: "absolute", left: -11, top: -2, width: 22, height: 22, borderRadius: 999, background: "var(--lobby-paper)", border: "1px solid var(--lobby-line)", display: "grid", placeItems: "center" }}>
                      <KindIcon kind={ev.kind} />
                    </span>
                    <Prov>{displayDate(ev.eventDate)} · {TIMELINE_KIND_LABELS[ev.kind] ?? ev.kind}</Prov>
                    <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2 }}>{ev.title}</div>
                    {ev.attendees.length > 0 && <div style={{ fontSize: 10.5, color: "var(--lobby-muted)", marginTop: 2, lineHeight: 1.45 }}>{ev.attendees.join(" · ")}</div>}
                  </div>
                );
              })}
            </Card>
          )}

          {/* ── ACUERDOS ── */}
          {otherAgreements.length > 0 && (
            <Card id="agreements" icon="agreements" title="Acuerdos"
              meta={openAgreements.length > 0
                ? <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--lobby-alert)", color: "#fff" }}>{openAgreements.length} pendiente{openAgreements.length > 1 ? "s" : ""}</span>
                : undefined}>
              <div className="space-y-4">
                {otherAgreements.map((agreement) => {
                  const open = agreement.status === "shared" || agreement.status === "changes_requested";
                  return (
                    <article key={agreement.id} style={open ? { background: "var(--lobby-lime-paper)", border: "1.5px solid var(--lobby-lime)", borderRadius: 10, padding: "12px 13px" } : undefined}>
                      <div className="lobby-label" style={{ color: open ? "var(--lobby-lime-ink)" : undefined }}>{agreement.agreementType.replaceAll("_", " ")} · v{agreement.version}</div>
                      <h3 style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3, margin: "3px 0 0" }}>{agreement.title}</h3>
                      {agreement.summary && <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--lobby-muted-2)", margin: "6px 0 0", whiteSpace: "pre-line" }}>{agreement.summary}</p>}
                      {open && <AgreementResponseActions agreementId={agreement.id} version={agreement.version} agreementType={agreement.agreementType} canRespond={canRespondTo(agreement.agreementType)} />}
                      {agreement.respondedAt && (
                        <div style={{ marginTop: 8 }}>
                          <Prov>Respondido {displayDate(agreement.respondedAt)}{agreement.respondedEmail ? ` · ${agreement.respondedEmail}` : ""}</Prov>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── DOCUMENTOS ── */}
          {documents.length > 0 && (
            <Card id="documents" icon="documents" title="Documentos"
              meta={<span style={{ fontSize: 10, color: "var(--lobby-muted)", fontWeight: 600 }}>{documents.length}</span>}>
              {documents.map((m, i) => {
                const fresh = relativeDate(m.clientVisibleAt ?? m.modifiedAt);
                return (
                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`doc:${m.title}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--lobby-line-soft)", textDecoration: "none", color: "inherit" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--lobby-muted)", fontWeight: 500, marginTop: 1 }}>
                        {CATEGORY_LABELS[m.category] ?? m.category} · {m.sharedBy}{fresh ? ` · ${fresh}` : ""}
                      </div>
                    </div>
                    <span aria-hidden="true" style={{ color: "var(--lobby-muted)", flex: "none" }}>↗</span>
                  </a>
                );
              })}
            </Card>
          )}

          {/* ── ADMINISTRATIVO ── */}
          {hasAdmin && (
            <Card id="admin" icon="admin" title="Administrativo"
              meta={copyText ? <CopyButton text={copyText} label="Copiar todo" /> : undefined}>
              <div className="space-y-4">
                {(hasCompany || hasBank || b.publicNote) && (
                  <div>
                    <div className="lobby-label" style={{ marginBottom: 6 }}>Datos de pago</div>
                    {hasCompany && <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-line" }}>{["Common House", ...billingLines].join("\n")}</div>}
                    {hasBank && <div style={{ marginTop: 10 }}><BankReveal accounts={b.bankAccounts} /></div>}
                    {b.publicNote && <p style={{ marginTop: 8, fontSize: 11, color: "var(--lobby-muted)" }}>{b.publicNote}</p>}
                  </div>
                )}
                {adminMaterials.length > 0 && (
                  <div>
                    <div className="lobby-label" style={{ marginBottom: 4 }}>Facturación</div>
                    {adminMaterials.map((m, i) => {
                      const fresh = relativeDate(m.clientVisibleAt ?? m.modifiedAt);
                      return (
                        <a key={m.id} href={m.url} target="_blank" rel="noreferrer" data-track={`admin-doc:${m.title}`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--lobby-line-soft)", textDecoration: "none", color: "inherit" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                            <div style={{ fontSize: 10.5, color: "var(--lobby-muted)", marginTop: 1 }}>{CATEGORY_LABELS[m.category] ?? m.category} · {m.sharedBy}{fresh ? ` · ${fresh}` : ""}</div>
                          </div>
                          <span aria-hidden="true" style={{ color: "var(--lobby-muted)", flex: "none" }}>↗</span>
                        </a>
                      );
                    })}
                  </div>
                )}
                {showClientBilling && (
                  <div style={{ borderTop: hasPayInfo || adminMaterials.length > 0 ? "1px solid var(--lobby-line-soft)" : undefined, paddingTop: hasPayInfo || adminMaterials.length > 0 ? 16 : 0 }}>
                    <div className="lobby-label" style={{ marginBottom: 8 }}>Tus datos de facturación</div>
                    <ClientBillingForm projectId={room.id} profile={cb} canEdit={canEditBilling} />
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 22, paddingTop: 14, borderTop: "1px solid var(--lobby-line)", fontFamily: "var(--font-hall-mono)", fontSize: 9.5, letterSpacing: ".8px", textTransform: "uppercase", color: "var(--lobby-muted)" }}>
        <span>Preparado por Common House</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          Confidencial{room.organizationName ? ` · ${room.organizationName}` : ""}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/isotipo-lime.png" alt="" style={{ height: 20, width: "auto" }} />
        </span>
      </footer>
    </LobbyShell>
  );
}

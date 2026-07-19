import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AgreementResponseActions } from "@/components/client-room/AgreementResponseActions";
import type { ClientRole } from "@/lib/require-client-access";
import type { ClientRoomMaterial, ClientRoomProject } from "@/lib/client-room";

const CATEGORY_LABELS: Record<string, string> = {
  plan_timeline: "Plans & timelines",
  deliverable: "Deliverables",
  presentation: "Presentations",
  manual: "Manuals",
  working_document: "Working documents",
  contract_agreement: "Contracts & agreements",
  proposal_budget: "Proposals & budgets",
  purchase_order: "Purchase orders",
  invoice: "Invoices",
  multimedia: "Multimedia",
  other: "Other",
};

const TIMELINE_KIND_LABELS: Record<string, string> = {
  meeting: "Meeting",
  milestone: "Milestone",
  document: "Document",
  exchange: "Exchange",
};

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function MaterialRows({ materials }: { materials: ClientRoomMaterial[] }) {
  if (materials.length === 0) return <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Nothing shared here yet.</p>;
  const groups = materials.reduce((acc, material) => {
    const rows = acc.get(material.category) ?? [];
    rows.push(material);
    acc.set(material.category, rows);
    return acc;
  }, new Map<string, ClientRoomMaterial[]>());
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([category, rows]) => (
        <div key={category}>
          <p className="mb-1 text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
            {CATEGORY_LABELS[category] ?? category}
          </p>
          {rows.map((material) => (
            <a key={material.id} href={material.url} target="_blank" rel="noreferrer" className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 hover:opacity-70" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{material.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>
                  {material.description || material.folderName || "Shared material"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.05em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
                {material.versionLabel && <span>{material.versionLabel}</span>}
                <span>{material.documentStatus.replaceAll("_", " ")}</span>
                <span>{displayDate(material.modifiedAt)}</span>
                <span aria-hidden="true">↗</span>
              </div>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

function Section({ id, title, flourish, children }: { id: string; title: string; flourish?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 py-8 sm:py-10" style={{ borderBottom: "1px solid var(--hall-line)" }}>
      <div className="flex items-baseline justify-between gap-4 pb-2 mb-5" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">{title}{flourish && <> <em style={{ fontFamily: "var(--font-hall-display)", fontWeight: 400 }}>{flourish}</em></>}</h2>
      </div>
      {children}
    </section>
  );
}

export function ClientRoomView({ room, role, adminPreview }: { room: ClientRoomProject; role: ClientRole | null; adminPreview: boolean }) {
  const operationalMaterials = room.materials.filter((item) => !["invoice", "purchase_order", "proposal_budget"].includes(item.category));
  const commercialMaterials = room.materials.filter((item) => ["invoice", "purchase_order", "proposal_budget"].includes(item.category));
  const canRespondTo = (agreementType: string) => role === "approver" || (
    role === "collaborator" && agreementType !== "commercial" && agreementType !== "purchase_order"
  );
  const openAgreements = room.agreements.filter((item) => item.status === "shared" || item.status === "changes_requested");
  // "What we heard" (understanding) renders in its own section as a curated,
  // source-referenced synthesis; keep it out of the generic Agreements list.
  const understandingAgreements = room.agreements.filter((item) => item.agreementType === "understanding");
  const otherAgreements = room.agreements.filter((item) => item.agreementType !== "understanding");
  const heardFields = [
    ["The challenge", room.whatWeHeard.challenge],
    ["What matters most", room.whatWeHeard.mattersMost],
    ["What may be in the way", room.whatWeHeard.obstacles],
    ["What success could look like", room.whatWeHeard.success],
  ].filter((item): item is [string, string] => !!item[1]);

  return (
    <div className="min-h-screen" style={{ background: "var(--hall-paper-0)", color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-sans)" }}>
      <header className="px-4 sm:px-8 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
        <div className="flex items-center gap-4 min-w-0"><BrandLogo variant="black" height={30} /><span className="hidden sm:inline text-[10px] uppercase tracking-[0.08em] truncate" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.roomLabel} · {room.name}</span></div>
        <div className="flex items-center gap-3">
          {adminPreview && <span className="hall-chip-dark">Admin preview</span>}
          <SignOutButton><button type="button" className="hall-btn-ghost">Sign out →</button></SignOutButton>
        </div>
      </header>

      <nav className="px-4 sm:px-8 overflow-x-auto" style={{ borderBottom: "1px solid var(--hall-line)", background: "var(--hall-paper-1)" }}>
        <div className="max-w-6xl mx-auto flex gap-5 min-w-max text-[11px] font-semibold">
          {[["overview", "Overview"], ["together", "Working together"], ["heard", "What we heard"], ["proposal", "Proposal"], ["agreements", "Agreements"], ["plan", "Plan"], ["materials", "Materials"], ["commercial", "Commercial"]].map(([href, label]) => <a key={href} href={`#${href}`} className="py-3.5 hover:underline">{label}{href === "agreements" && openAgreements.length > 0 ? ` ${openAgreements.length}` : ""}</a>)}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-8">
        <section id="overview" className="scroll-mt-24 py-10 sm:py-14" style={{ borderBottom: "1px solid var(--hall-line)" }}>
          <p className="text-[10px] uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{room.organizationName ?? "Common House client room"} · {room.currentStage ?? room.projectStatus ?? room.roomStatus}</p>
          <h1 className="text-[38px] sm:text-[56px] leading-[1] tracking-[-0.035em]" style={{ fontFamily: "var(--font-hall-display)", fontWeight: 400 }}>{room.name}</h1>
          {room.welcomeNote && <p className="mt-6 max-w-3xl text-[16px] leading-[1.65]">{room.welcomeNote}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 mt-9" style={{ borderTop: "1px solid var(--hall-line)", borderBottom: "1px solid var(--hall-line)" }}>
            <div className="py-4 sm:pr-5"><p className="text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Where we are</p><p className="mt-2 text-[14px] font-semibold">{room.currentFocus || "Being prepared"}</p></div>
            <div className="py-4 sm:px-5" style={{ borderLeft: "1px solid var(--hall-line)" }}><p className="text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Next milestone</p><p className="mt-2 text-[14px] font-semibold">{room.nextMilestone || "To be confirmed"}</p></div>
            <div className="py-4 sm:pl-5" style={{ borderLeft: "1px solid var(--hall-line)" }}><p className="text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Needs your input</p><p className="mt-2 text-[14px] font-semibold">{openAgreements.length === 0 ? "Nothing open" : `${openAgreements.length} item${openAgreements.length === 1 ? "" : "s"}`}</p></div>
          </div>
        </section>

        <Section id="together" title="Working" flourish="together">
          {room.timelineEvents.length === 0
            ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Meetings, signed documents and milestones from our work together will appear here.</p>
            : <div>{room.timelineEvents.map((ev) => (
                <div key={ev.id} className="grid grid-cols-[76px_1fr] sm:grid-cols-[110px_1fr] gap-3 sm:gap-5 py-4" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <span className="text-[10px] pt-0.5" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{displayDate(ev.eventDate)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hall-chip-outline">{TIMELINE_KIND_LABELS[ev.kind] ?? ev.kind}</span>
                      <strong className="text-[14px]">{ev.title}</strong>
                    </div>
                    {ev.attendees.length > 0 && <p className="mt-1.5 text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{ev.attendees.join("  ·  ")}</p>}
                    {ev.summary && <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ color: "var(--hall-ink-3)" }}>{ev.summary}</p>}
                  </div>
                </div>
              ))}</div>}
        </Section>

        <Section id="heard" title="What we" flourish="heard">
          {understandingAgreements.length === 0 && heardFields.length === 0 && room.whatWeHeard.heard.length === 0
            ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Common House is preparing the first synthesis.</p>
            : <div className="space-y-8">
                {understandingAgreements.map((a) => <div key={a.id}>{a.summary && <p className="text-[14px] leading-[1.7] max-w-3xl" style={{ whiteSpace: "pre-line" }}>{a.summary}</p>}</div>)}
                {(heardFields.length > 0 || room.whatWeHeard.heard.length > 0) && <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">{heardFields.map(([label, value]) => <div key={label}><p className="text-[10px] uppercase tracking-[0.08em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{label}</p><p className="text-[14px] leading-[1.65]">{value}</p></div>)}{room.whatWeHeard.heard.map((item, index) => <div key={`${item.point}-${index}`}><p className="text-[10px] uppercase tracking-[0.08em] mb-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>From the conversation</p><p className="text-[14px] leading-[1.65]">{item.point}</p>{item.speakerName && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-muted-3)" }}>— {item.speakerName}</p>}</div>)}</div>}
              </div>}
        </Section>

        <Section id="proposal" title="Our" flourish="proposal">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-start"><div><span className="hall-chip-outline">{room.proposal.status}</span><p className="mt-4 max-w-3xl text-[14px] leading-[1.65]">{room.proposal.summary || "The proposal is being prepared from what we heard."}</p></div>{room.proposal.file_url && <a className="hall-btn-primary" href={room.proposal.file_url} target="_blank" rel="noreferrer">Open {room.proposal.file_name || "proposal"} ↗</a>}</div>
        </Section>

        <Section id="agreements" title="Agreements" flourish="and next steps">
          {otherAgreements.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No shared agreements yet. Confirmed decisions and next steps will appear here.</p> : <div>{otherAgreements.map((agreement) => <article key={agreement.id} className="py-4" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5"><div className="flex-1"><p className="text-[10px] uppercase tracking-[0.08em] mb-1" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{agreement.agreementType.replaceAll("_", " ")} · v{agreement.version}</p><h3 className="text-[15px] font-bold">{agreement.title}</h3>{agreement.summary && <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{agreement.summary}</p>}</div><span className="hall-chip-outline">{agreement.status.replaceAll("_", " ")}</span></div>{(agreement.status === "shared" || agreement.status === "changes_requested") && <AgreementResponseActions agreementId={agreement.id} version={agreement.version} agreementType={agreement.agreementType} canRespond={canRespondTo(agreement.agreementType)} />}{agreement.respondedAt && <p className="mt-3 text-[10px]" style={{ color: "var(--hall-muted-3)" }}>Responded {displayDate(agreement.respondedAt)}{agreement.respondedEmail ? ` · ${agreement.respondedEmail}` : ""}</p>}</article>)}</div>}
        </Section>

        <Section id="plan" title="Plan" flourish="and progress">
          {room.timeline.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>The first project plan will appear here.</p> : <div>{room.timeline.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[90px_1fr_auto] gap-4 py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><span className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{item.date || "—"}</span><strong className="text-[13px]">{item.label}</strong><span className="hall-chip-outline">{item.type}</span></div>)}</div>}
        </Section>

        <Section id="materials" title="Shared" flourish="materials"><MaterialRows materials={operationalMaterials} /></Section>
        <Section id="commercial" title="Commercial" flourish="record">
          <MaterialRows materials={commercialMaterials} />
          {room.agreements.filter((item) => item.agreementType === "commercial" || item.agreementType === "purchase_order").length === 0 && commercialMaterials.length === 0 && <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Proposals, purchase orders and invoices will appear here when shared.</p>}
        </Section>
      </main>
      <footer className="px-4 sm:px-8 py-7" style={{ borderTop: "1px solid var(--hall-ink-0)" }}><div className="max-w-6xl mx-auto flex flex-wrap justify-between gap-3 text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}><span>Prepared by Common House</span><span><Link href="/trust">Trust</Link> · <Link href="/status">Status</Link> · <Link href="/security">Security</Link></span></div></footer>
    </div>
  );
}

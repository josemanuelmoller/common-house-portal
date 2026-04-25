'use client';

import React, { useState } from "react";
import type { PersonRecord } from "@/lib/notion";
import { DIGITAL_RESIDENTS, type DigitalResidentProfile } from "@/types/house";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── K-v2 section head (inline because client component) ─────────────────────

function SectionHead({
  title,
  flourish,
  meta,
}: {
  title: string;
  flourish?: string;
  meta?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 pb-2 mb-4 mt-10 first:mt-0"
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
          className="uppercase whitespace-nowrap"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            color: "var(--hall-muted-2)",
            letterSpacing: "0.06em",
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

// ─── Person card — unified flat K-v2 (no dark EIR variant) ───────────────────

type CardVariant = "cofounder" | "internal" | "eir";

const VARIANT_BADGE: Record<CardVariant, string> = {
  cofounder: "CO-FOUNDER",
  eir:       "EIR",
  internal:  "CORE TEAM",
};

function PersonCard({ person, variant }: { person: PersonRecord; variant: CardVariant }) {
  const ini = initials(person.name);
  const badgeLabel = VARIANT_BADGE[variant];

  // Compose the muted footer line: location · email/linkedin
  const footer: React.ReactNode[] = [];
  if (person.location) footer.push(<span key="loc">◎ {person.location}</span>);
  if (person.linkedin) {
    footer.push(
      <a
        key="li"
        href={person.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
        style={{ color: "var(--hall-muted-2)" }}
      >
        LinkedIn ↗
      </a>
    );
  } else if (person.email) {
    footer.push(
      <a
        key="em"
        href={`mailto:${person.email}`}
        className="hover:underline truncate"
        style={{ color: "var(--hall-muted-2)" }}
      >
        {person.email}
      </a>
    );
  }

  return (
    <div
      className="rounded-[3px] p-4 flex items-start gap-3 transition-colors hover:bg-[var(--hall-paper-1)]"
      style={{
        background: "var(--hall-paper-0)",
        border: "1px solid var(--hall-line)",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{
          background: "var(--hall-fill-soft)",
          color: "var(--hall-ink-0)",
          border: "1px solid var(--hall-line)",
        }}
      >
        {ini}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <p
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {person.name}
          </p>
          <span
            className="font-bold uppercase shrink-0"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "var(--hall-muted-2)",
            }}
          >
            {badgeLabel}
          </span>
        </div>
        {person.jobTitle && (
          <p
            className="text-[11px] mt-0.5 truncate"
            style={{ color: "var(--hall-muted-2)" }}
          >
            {person.jobTitle}
          </p>
        )}
        {footer.length > 0 && (
          <div
            className="flex items-center gap-2 flex-wrap mt-2 text-[10.5px] min-w-0"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
            {footer.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--hall-muted-3)" }}>·</span>}
                {f}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Digital Resident Card ────────────────────────────────────────────────────

const DIGITAL_ICONS: Record<string, React.ReactNode> = {
  "information-coordinator": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 2h12v8H2z" /><path d="M5 12h6M8 10v2" />
    </svg>
  ),
  "intelligence-analyst": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" />
    </svg>
  ),
  "project-manager": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <polyline points="3 6 8 10 13 6" /><rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  ),
  "internal-auditor": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 14s-6-3-6-7.5A3.5 3.5 0 0 1 8 3a3.5 3.5 0 0 1 6 3.5C14 11 8 14 8 14z" />
    </svg>
  ),
  "portfolio-director": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <polyline points="1 4 8 10 15 4" /><path d="M1 4h14v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" />
    </svg>
  ),
  "chief-of-staff": (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="15" y1="1" x2="8" y2="8" /><polygon points="15 1 11 15 8 8 1 5 15 1" />
    </svg>
  ),
};

function DigitalCard({ resident }: { resident: DigitalResidentProfile }) {
  const iconKey = resident.role.toLowerCase().replace(/\s+/g, "-");
  const icon = DIGITAL_ICONS[iconKey] ?? (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
    </svg>
  );

  return (
    <div
      className="rounded-[3px] p-4 flex items-start gap-3"
      style={{
        background: "var(--hall-paper-0)",
        border: "1px solid var(--hall-line)",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: "var(--hall-fill-soft)",
          color: "var(--hall-ink-3)",
          border: "1px solid var(--hall-line)",
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-semibold"
          style={{ color: "var(--hall-ink-0)" }}
        >
          {resident.displayName}
        </p>
        <p
          className="text-[11px] leading-snug mt-0.5"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {resident.tagline}
        </p>
        <p
          className="text-[10px] mt-2 uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
        >
          Feeds: {resident.signals.slice(0, 3).join(" · ")}
        </p>
      </div>
    </div>
  );
}

// ─── Filter definitions ───────────────────────────────────────────────────────

const FILTERS = ["All", "Co-founders", "EIRs", "Core team", "Digital"] as const;
type FilterLabel = typeof FILTERS[number];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ResidentsClientProps {
  coFounders: PersonRecord[];
  eirs: PersonRecord[];
  coreTeam: PersonRecord[];
  humanCount: number;
}

// ─── Client component ─────────────────────────────────────────────────────────

export default function ResidentsClient({
  coFounders,
  eirs,
  coreTeam,
  humanCount,
}: ResidentsClientProps) {
  const [activeFilter, setActiveFilter] = useState<FilterLabel>("All");

  const counts: Record<FilterLabel, number> = {
    All: coFounders.length + eirs.length + coreTeam.length + DIGITAL_RESIDENTS.length,
    "Co-founders": coFounders.length,
    EIRs: eirs.length,
    "Core team": coreTeam.length,
    Digital: DIGITAL_RESIDENTS.length,
  };

  return (
    <>
      {/* ── K-v2 tab filters ── */}
      <div
        className="px-4 sm:px-9 overflow-x-auto"
        style={{
          background: "var(--hall-paper-1)",
          borderBottom: "1px solid var(--hall-line)",
        }}
      >
        <div className="flex items-center gap-6 py-2.5">
          {FILTERS.map((label) => {
            const isActive = activeFilter === label;
            const count = counts[label];
            return (
              <button
                key={label}
                onClick={() => setActiveFilter(label)}
                className="relative flex items-baseline gap-1.5 py-[3px] text-[11.5px] font-semibold tracking-[0.01em] cursor-pointer bg-transparent border-0"
                style={{
                  color: isActive ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
                  borderBottom: isActive
                    ? "2px solid var(--hall-ink-0)"
                    : "2px solid transparent",
                  paddingBottom: "1px",
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 sm:px-9 py-7 sm:py-10 max-w-6xl">

        {/* Co-founders */}
        {(activeFilter === "All" || activeFilter === "Co-founders") && coFounders.length > 0 && (
          <>
            <SectionHead
              title="Co-"
              flourish="founders"
              meta={`${coFounders.length} ${coFounders.length === 1 ? "PERSON" : "PEOPLE"}`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
              {coFounders.map((p) => (
                <PersonCard key={p.id} person={p} variant="cofounder" />
              ))}
            </div>
          </>
        )}

        {/* EIRs */}
        {(activeFilter === "All" || activeFilter === "EIRs") && eirs.length > 0 && (
          <>
            <SectionHead
              title="Entrepreneurs in "
              flourish="residence"
              meta={`${eirs.length} ${eirs.length === 1 ? "EIR" : "EIRS"}`}
            />
            <p
              className="text-[11.5px] leading-relaxed mb-4 max-w-3xl"
              style={{ color: "var(--hall-muted-2)" }}
            >
              EIRs are senior operators embedded in the House. They bring deep domain expertise,
              active networks, and a track record that CH&apos;s clients can access directly — not
              just as advisors, but as strategic partners on specific engagements.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
              {eirs.map((p) => (
                <PersonCard key={p.id} person={p} variant="eir" />
              ))}
            </div>
          </>
        )}

        {/* Core team */}
        {(activeFilter === "All" || activeFilter === "Core team") && coreTeam.length > 0 && (
          <>
            <SectionHead
              title="Core "
              flourish="team"
              meta={`${coreTeam.length} ${coreTeam.length === 1 ? "PERSON" : "PEOPLE"}`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
              {coreTeam.map((p) => (
                <PersonCard key={p.id} person={p} variant="internal" />
              ))}
            </div>
          </>
        )}

        {humanCount === 0 && activeFilter !== "Digital" && (
          <div
            className="p-8 text-center rounded-[3px]"
            style={{ border: "1px solid var(--hall-line-soft)" }}
          >
            <p className="text-[13px] font-bold" style={{ color: "var(--hall-ink-0)" }}>
              No human residents found
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--hall-muted-2)" }}>
              People are pulled from CH People [OS v2] in Notion.
            </p>
          </div>
        )}

        {/* Digital Residents */}
        {(activeFilter === "All" || activeFilter === "Digital") && (
          <>
            <SectionHead
              title="Digital "
              flourish="residents"
              meta={`${DIGITAL_RESIDENTS.length} AGENTS · ALWAYS ON`}
            />
            <p
              className="text-[11.5px] leading-relaxed mb-4 max-w-3xl"
              style={{ color: "var(--hall-muted-2)" }}
            >
              Digital residents operate continuously — capturing, classifying, auditing, and
              maintaining the OS while humans focus on strategy and output. They&apos;re listed
              here without gimmick: these are functional agents, each with a specific scope.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DIGITAL_RESIDENTS.map((r) => (
                <DigitalCard key={r.role} resident={r} />
              ))}
            </div>
          </>
        )}

        {/* Footer note */}
        <div className="pt-10">
          <p
            className="text-[10.5px] leading-relaxed max-w-2xl"
            style={{ color: "var(--hall-muted-3)" }}
          >
            Digital residents are operational roles built from real project signals.
            They support the work — they do not replace judgment, conversation,
            or leadership. They also appear contextually in The Hall, The Workroom,
            and the Control Room, but this page is their canonical home.
          </p>
        </div>
      </div>
    </>
  );
}

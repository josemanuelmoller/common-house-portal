/**
 * HallComposedHero — flashy entry visual for /hall, driven by the published
 * `hall_hero` JSONB (compose pipeline output).
 *
 * Three stacked sections:
 *   1) Pulled-quote hero — Instrument Serif italic, ~clamp(40px,7vw,96px),
 *      counterpart's verbatim words.
 *   2) 3 strategic angle bento — first card large, two stacked right.
 *   3) Compact horizontal timeline strip with active-today lime pulse.
 *
 * Server component. No interactivity. Pure render of pre-published JSONB.
 *
 * Renders nothing if `hero` is null — the existing Welcome section stays the
 * entry point for projects that haven't gone through the compose flow.
 *
 * Distinct from the legacy `HallHero` component (welcome note + CTA), which
 * is still used by the old /hall layout.
 */
import type {
  HallDraft, HallDraftAngle, HallDraftListeningPoint, HallDraftProposal, HallDraftTimelineItem,
} from "@/lib/hall-compose";

type Props = {
  hero:        HallDraft | null;
  projectName: string;
};

export function HallComposedHero({ hero, projectName }: Props) {
  if (!hero) return null;
  const quote = hero.quote;
  const angles = hero.angles ?? [];
  const timeline = hero.timeline ?? [];

  return (
    <>
      {quote && (
        <section
          className="px-9 py-16 md:py-24 relative"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <div className="max-w-5xl mx-auto">
            <p
              className="mb-6"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--hall-muted-2)",
              }}
            >
              · LISTENING
            </p>
            <blockquote
              className="font-serif italic leading-[1.05] tracking-tight"
              style={{
                fontFamily: "var(--font-hall-display, 'Instrument Serif', serif)",
                fontSize: "clamp(40px, 7vw, 96px)",
                color: "var(--hall-ink-0)",
                fontWeight: 400,
              }}
            >
              &ldquo;{quote.text}&rdquo;
            </blockquote>
            <footer
              className="mt-8 flex items-center gap-3 flex-wrap"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 11,
                color: "var(--hall-muted-2)",
                letterSpacing: "0.04em",
              }}
            >
              <span>—</span>
              <span style={{ color: "var(--hall-ink-0)", fontWeight: 700 }}>
                {quote.speaker_name}
              </span>
              {quote.speaker_role && <span>· {quote.speaker_role}</span>}
              {quote.timestamp_seconds != null && (
                <span style={{ color: "var(--hall-muted-3)" }}>
                  · {Math.floor(quote.timestamp_seconds / 60)}:
                  {String(Math.floor(quote.timestamp_seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </footer>
          </div>
        </section>
      )}

      {angles.length > 0 && (
        <section
          className="px-9 py-12"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <div className="max-w-5xl mx-auto">
            <p
              className="mb-6"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--hall-muted-2)",
              }}
            >
              · STRATEGIC ANGLES FOR {projectName.toUpperCase()}
            </p>
            <BentoGrid angles={angles} />
          </div>
        </section>
      )}

      {/* Listening Map renders BEFORE timeline so the narrative goes:
            heard → needed → propuesta → timeline. */}
      {(hero.listening?.heard.length ?? 0) > 0 || (hero.listening?.needed.length ?? 0) > 0 ? (
        <ListeningMap listening={hero.listening!} />
      ) : null}

      {hero.proposal && hero.proposal.status !== "draft" ? (
        <ProposalSection proposal={hero.proposal} />
      ) : null}

      {timeline.length > 0 && (
        <section
          className="px-9 py-8"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          <div className="max-w-5xl mx-auto">
            <p
              className="mb-5"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--hall-muted-2)",
              }}
            >
              · JOURNEY
            </p>
            <Timeline items={timeline} />
          </div>
        </section>
      )}
    </>
  );
}

// ─── Listening Map ────────────────────────────────────────────────────────────

function ListeningMap({ listening }: { listening: { heard: HallDraftListeningPoint[]; needed: HallDraftListeningPoint[] } }) {
  return (
    <section
      className="px-9 py-12"
      style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
        <ListeningColumn
          label="What we heard"
          accent="var(--hall-muted-2)"
          items={listening.heard}
        />
        <ListeningColumn
          label="What's needed"
          accent="var(--hall-ink-0)"
          items={listening.needed}
        />
      </div>
    </section>
  );
}

function ListeningColumn({ label, accent, items }: { label: string; accent: string; items: HallDraftListeningPoint[] }) {
  if (items.length === 0) return <div />;
  return (
    <div>
      <p
        className="mb-4"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        · {label.toUpperCase()}
      </p>
      <ul className="space-y-3">
        {items.map((p, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span
              className="mt-2 shrink-0"
              style={{
                width: 6, height: 6, borderRadius: 3,
                background: accent,
                opacity: 0.85,
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>
                {p.point}
              </p>
              {p.speaker_name && (
                <p
                  className="mt-1"
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 9,
                    color: "var(--hall-muted-3)", letterSpacing: "0.04em",
                  }}
                >
                  — {p.speaker_name}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Proposal section ─────────────────────────────────────────────────────────

function ProposalSection({ proposal }: { proposal: HallDraftProposal }) {
  const statusColor: Record<HallDraftProposal["status"], string> = {
    draft:      "var(--hall-muted-3)",
    preparing:  "var(--hall-info)",
    ready:      "var(--hall-warn)",
    sent:       "var(--hall-ok)",
    accepted:   "var(--hall-ink-0)",
  };
  const statusLabel: Record<HallDraftProposal["status"], string> = {
    draft:      "DRAFT",
    preparing:  "IN PREPARATION",
    ready:      "READY FOR REVIEW",
    sent:       "SENT",
    accepted:   "ACCEPTED",
  };

  return (
    <section
      className="px-9 py-12"
      style={{ borderBottom: "1px solid var(--hall-line-soft)", background: "var(--hall-fill-soft)" }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <p
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--hall-muted-2)",
            }}
          >
            · PROPOSAL
          </p>
          <span
            className="px-2 py-0.5"
            style={{
              fontFamily: "var(--font-hall-mono)", fontSize: 9,
              letterSpacing: "0.08em", fontWeight: 700,
              color: statusColor[proposal.status],
              border: `1px solid ${statusColor[proposal.status]}`,
            }}
          >
            {statusLabel[proposal.status]}
          </span>
        </div>
        {proposal.summary && (
          <p
            className="text-[16px] leading-relaxed mb-5"
            style={{ color: "var(--hall-ink-0)", maxWidth: 720 }}
          >
            {proposal.summary}
          </p>
        )}
        {proposal.file_url && proposal.file_name && (
          <a
            href={proposal.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 transition-colors"
            style={{
              border: "1px solid var(--hall-ink-0)",
              fontFamily: "var(--font-hall-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--hall-ink-0)",
              background: "var(--hall-paper-0)",
            }}
          >
            ↓ {proposal.file_name}
          </a>
        )}
        {!proposal.file_url && proposal.status !== "sent" && proposal.status !== "accepted" && (
          <p
            style={{
              fontFamily: "var(--font-hall-mono)", fontSize: 10,
              color: "var(--hall-muted-3)",
            }}
          >
            (file will be attached when the proposal is ready)
          </p>
        )}
      </div>
    </section>
  );
}

function BentoGrid({ angles }: { angles: HallDraftAngle[] }) {
  const [first, ...rest] = angles;
  if (!first) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
      <AngleCard angle={first} large />
      <div className="flex flex-col gap-3 md:gap-4">
        {rest.slice(0, 2).map((a, i) => (
          <AngleCard key={i} angle={a} />
        ))}
      </div>
    </div>
  );
}

function AngleCard({ angle, large = false }: { angle: HallDraftAngle; large?: boolean }) {
  return (
    <div
      className="px-6 py-5"
      style={{
        background: "var(--hall-paper-0)",
        border: "1px solid var(--hall-ink-0)",
        minHeight: large ? 280 : 120,
      }}
    >
      <p
        className="mb-3"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--hall-muted-3)",
          fontWeight: 700,
        }}
      >
        ANGLE
      </p>
      <h3
        className={large ? "text-[28px] md:text-[36px]" : "text-[16px] md:text-[20px]"}
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-ink-0)",
          fontWeight: 800,
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
        }}
      >
        {angle.title}
      </h3>
      <p
        className={`mt-3 ${large ? "text-[15px]" : "text-[12px]"} leading-relaxed`}
        style={{ color: "var(--hall-ink-3)" }}
      >
        {angle.body}
      </p>
      {large && angle.evidence_excerpt && (
        <p
          className="mt-5 pt-4"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            color: "var(--hall-muted-2)",
            borderTop: "1px solid var(--hall-line-soft)",
            fontStyle: "italic",
          }}
        >
          &ldquo;{angle.evidence_excerpt}&rdquo;
        </p>
      )}
    </div>
  );
}

function Timeline({ items }: { items: HallDraftTimelineItem[] }) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="overflow-x-auto">
      <div className="flex items-start gap-4 min-w-max pb-2">
        {sorted.map((it, i) => {
          const isToday  = it.type === "today";
          const isPast   = it.type === "past";
          const dotColor = isToday ? "var(--hall-lime)" : isPast ? "var(--hall-ink-0)" : "var(--hall-muted-3)";
          const labelColor = isToday ? "var(--hall-ink-0)" : isPast ? "var(--hall-ink-3)" : "var(--hall-muted-2)";
          return (
            <div key={i} className="flex flex-col items-start" style={{ minWidth: 140 }}>
              <div className="flex items-center gap-2 w-full">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: dotColor,
                    boxShadow: isToday ? "0 0 0 4px var(--hall-lime-soft, rgba(178,255,89,0.25))" : "none",
                  }}
                />
                {i < sorted.length - 1 && (
                  <span className="h-px flex-1" style={{ background: "var(--hall-line)", minWidth: 60 }} />
                )}
              </div>
              <p
                className="mt-2"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.04em",
                }}
              >
                {new Date(it.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
              <p
                className="mt-1 text-[12px] leading-snug"
                style={{ color: labelColor, fontWeight: isToday ? 700 : 400 }}
              >
                {it.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  HallDraft, HallDraftAngle, HallDraftListeningPoint, HallDraftProposal,
  HallDraftTimelineItem, HallDraftTopic,
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

      {/* Engagement signature row — stat tile (always renderable) + topic
          radar (renders only when topics are populated). The pair sits
          between the bento and the listening map so the visual rhythm
          alternates: text · numbers · text · numbers · text. */}
      <EngagementSignature hero={hero} />

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

// ─── Engagement signature (stat tile + topic radar) ──────────────────────────
//
// Both visuals are systemic — derived from data already present on the published
// hero. No per-client tuning needed.

function EngagementSignature({ hero }: { hero: HallDraft }) {
  const todayItem = hero.timeline?.find(t => t.type === "today");
  const futureCount = hero.timeline?.filter(t => t.type === "future").length ?? 0;
  const insightCount =
    (hero.listening?.heard.length ?? 0) + (hero.listening?.needed.length ?? 0);

  const daysSinceToday = todayItem
    ? Math.max(0, Math.floor((Date.now() - new Date(todayItem.date).getTime()) / 86400_000))
    : null;

  const stats: Array<{ label: string; value: string }> = [
    { label: "INSIGHTS", value: String(insightCount) },
    { label: "ANGLES", value: String(hero.angles?.length ?? 0) },
    { label: "NEXT STEPS", value: String(futureCount) },
    {
      label: "DAYS AGO",
      value: daysSinceToday == null ? "—" : daysSinceToday === 0 ? "TODAY" : String(daysSinceToday),
    },
  ];

  // The radar only renders when there are at least 3 topics — fewer doesn't
  // produce a meaningful polygon.
  const topics = (hero.topics ?? []).slice(0, 6);
  const showRadar = topics.length >= 3;

  return (
    <section
      className="px-9 py-12"
      style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Stat tile — always renders */}
        <div
          className={showRadar ? "md:col-span-7" : "md:col-span-12"}
        >
          <StatTile insightCount={insightCount} stats={stats} />
        </div>

        {/* Topic radar — renders when we have at least 3 topics */}
        {showRadar && (
          <div className="md:col-span-5">
            <TopicRadar topics={topics} />
          </div>
        )}
      </div>
    </section>
  );
}

function StatTile({
  insightCount, stats,
}: { insightCount: number; stats: Array<{ label: string; value: string }> }) {
  return (
    <div
      className="px-7 py-8 h-full flex flex-col justify-between"
      style={{ border: "1px solid var(--hall-ink-0)", background: "var(--hall-paper-0)" }}
    >
      <div>
        <p
          className="mb-3"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--hall-muted-2)",
          }}
        >
          · DEPTH OF LISTENING
        </p>
        <p
          className="leading-none"
          style={{
            fontFamily: "var(--font-hall-display, 'Instrument Serif', serif)",
            fontSize: "clamp(72px, 9vw, 144px)",
            color: "var(--hall-ink-0)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
          }}
        >
          {insightCount}
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: "var(--font-hall-display, 'Instrument Serif', serif)",
            fontStyle: "italic",
            fontSize: "clamp(20px, 2.4vw, 32px)",
            color: "var(--hall-muted-2)",
            fontWeight: 400,
          }}
        >
          insights captured
        </p>
      </div>

      <div
        className="grid grid-cols-4 gap-2 mt-8 pt-5"
        style={{ borderTop: "1px solid var(--hall-line)" }}
      >
        {stats.map(s => (
          <div key={s.label}>
            <p
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 9,
                letterSpacing: "0.10em",
                color: "var(--hall-muted-3)",
                fontWeight: 700,
              }}
            >
              {s.label}
            </p>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 16,
                color: "var(--hall-ink-0)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicRadar({ topics }: { topics: HallDraftTopic[] }) {
  // Layout the radar inside a 280×280 viewBox. Vertices are placed evenly
  // around a circle, weights normalize to 0..1 of the max ring radius.
  const SIZE = 280;
  const CENTER = SIZE / 2;
  const MAX_R = SIZE * 0.36;
  const N = topics.length;
  const maxWeight = Math.max(1, ...topics.map(t => t.weight));

  // Vertex angles (start at top, clockwise)
  const angles = topics.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / N);

  function point(angleRad: number, radius: number): [number, number] {
    return [CENTER + radius * Math.cos(angleRad), CENTER + radius * Math.sin(angleRad)];
  }

  const ringRadii = [0.25, 0.5, 0.75, 1].map(f => f * MAX_R);

  // Polygon points for each ring (used as backdrop grid)
  const ringPaths = ringRadii.map(r =>
    angles.map(a => point(a, r).join(",")).join(" "),
  );

  // Data polygon — radius scaled by weight / maxWeight
  const dataPoints = topics.map((t, i) =>
    point(angles[i], (t.weight / maxWeight) * MAX_R),
  );
  const dataPolygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div
      className="h-full flex flex-col justify-between p-5"
      style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-0)" }}
    >
      <p
        className="mb-2"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        · TOPIC TERRAIN
      </p>
      <div className="flex-1 flex items-center justify-center">
        <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Topic radar">
          {/* Backdrop rings */}
          {ringPaths.map((points, i) => (
            <polygon
              key={i}
              points={points}
              fill="none"
              stroke="var(--hall-line)"
              strokeWidth={i === ringPaths.length - 1 ? 1 : 0.5}
            />
          ))}
          {/* Spokes */}
          {angles.map((a, i) => {
            const [x, y] = point(a, MAX_R);
            return (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke="var(--hall-line)"
                strokeWidth={0.5}
              />
            );
          })}
          {/* Data polygon */}
          <polygon
            points={dataPolygon}
            fill="var(--hall-ink-0)"
            fillOpacity={0.08}
            stroke="var(--hall-ink-0)"
            strokeWidth={1.25}
          />
          {/* Data vertices */}
          {dataPoints.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2.5}
              fill="var(--hall-ink-0)"
            />
          ))}
          {/* Topic labels */}
          {topics.map((t, i) => {
            const [lx, ly] = point(angles[i], MAX_R + 14);
            // Anchor based on which side of center it falls on
            const dx = lx - CENTER;
            const anchor = Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end";
            return (
              <text
                key={i}
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontFamily="var(--font-hall-mono)"
                fontSize={9}
                fill="var(--hall-ink-0)"
                style={{ letterSpacing: "0.04em", fontWeight: 700 }}
              >
                {t.name.toUpperCase()}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

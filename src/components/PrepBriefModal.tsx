"use client";

/**
 * PrepBriefModal — renders a prep brief for a Suggested Time Block of type "prep".
 *
 * Flow:
 *  1. On open, POST /api/prep-meeting-brief { eventId }.
 *  2. While loading (~20-25s with Sonnet), show a soft skeleton.
 *  3. On success, render 4 prose sections + a collapsible FactSheet tray.
 *  4. On calendar_scope_missing, render the same soft re-authorise state that
 *     SuggestedTimeBlocks uses. No red error chrome.
 *
 * Caching: briefs are cached in parent-held state by eventId. Re-opening the
 * same brief within the session is instant. Server-side caching is v2.
 */

import { useEffect, useRef, useState } from "react";

type BriefProse = {
  briefing:     string;
  prep_actions: string;
  opener:       string;
};

type OpenCommitment = {
  description: string;
  direction:   "mine_to_them" | "theirs_to_me";
  opened_date: string | null;
  source:      string;
  days_open:   number | null;
};

export type BriefResponse = {
  ok?:    boolean;
  brief?: {
    fact_sheet: {
      counterpart: { full_name: string; trust_tier: string; resolution_method: string };
      meeting:     { title: string; days_until: number; duration_min: number };
      disclosure:  { profile_name: string; deny: string[] };
      open_commitments: OpenCommitment[];
      confidence:  { intent: string; overall: string };
      warnings:    string[];
    };
    prose:      BriefProse;
    validation: { passed: boolean; issues: string[] };
  };
  error?:   string;
  message?: string;
};

type Props = {
  eventId:       string;
  meetingTitle:  string;
  /** Called when user clicks the outer backdrop or Close. */
  onClose:       () => void;
  /** Optional cache from parent — lets closing and reopening the same event be instant. */
  cachedBrief?:  BriefResponse["brief"];
  onBriefFetched?: (eventId: string, brief: BriefResponse["brief"]) => void;
};

export function PrepBriefModal({ eventId, meetingTitle, onClose, cachedBrief, onBriefFetched }: Props) {
  const [brief, setBrief]       = useState<BriefResponse["brief"] | undefined>(cachedBrief);
  const [loading, setLoading]   = useState(!cachedBrief);
  const [error, setError]       = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (cachedBrief || ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/prep-meeting-brief", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ eventId }),
          cache:   "no-store",
        });
        const data = (await res.json()) as BriefResponse;
        if (!res.ok || data.error) {
          if (data.error === "calendar_scope_missing") {
            setError("__consent_needed__");
          } else {
            setError(data.message || data.error || "Unknown error generating brief.");
          }
          return;
        }
        if (data.brief) {
          setBrief(data.brief);
          onBriefFetched?.(eventId, data.brief);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, cachedBrief, onBriefFetched]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0a0a0a]/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-12 mb-12 w-full max-w-[720px] bg-white rounded-2xl border border-[#e4e4dd] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[#f4f4ef] flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/35">
              Prep brief
            </p>
            <h2 className="text-[15px] font-semibold text-[#0a0a0a] leading-snug mt-0.5 truncate">
              {meetingTitle}
            </h2>
            {brief && (
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-[#0a0a0a]/55">
                  {brief.fact_sheet.counterpart.full_name}
                </span>
                <span className="text-[#0a0a0a]/20">·</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/45">
                  {brief.fact_sheet.counterpart.trust_tier} tier
                </span>
                <span className="text-[#0a0a0a]/20">·</span>
                <span className="text-[10px] text-[#0a0a0a]/55">
                  in {brief.fact_sheet.meeting.days_until}d · {brief.fact_sheet.meeting.duration_min}min
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[10px] font-bold text-[#0a0a0a]/40 hover:text-[#0a0a0a] uppercase tracking-widest shrink-0"
          >
            Close ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="px-6 py-5">
          {loading && <BriefSkeleton />}

          {error === "__consent_needed__" && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-[11px] text-[#0a0a0a]/60 flex-1">
                Waiting on Google Calendar consent — brief needs access to read meeting details.
              </p>
              <a
                href="/api/google/auth"
                className="text-[9px] font-bold text-[#0a0a0a] hover:underline uppercase tracking-widest shrink-0"
              >
                Re-authorise →
              </a>
            </div>
          )}

          {error && error !== "__consent_needed__" && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-[11px] text-red-700">{error}</p>
            </div>
          )}

          {brief && !loading && <BriefBody brief={brief} showFacts={showFacts} setShowFacts={setShowFacts} />}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function BriefSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#c6f24a] animate-pulse" />
        <p className="text-[11px] text-[#0a0a0a]/50">
          Generating — pulling Gmail, Fireflies, WhatsApp and past meeting notes…
        </p>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-3/4" />
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-full" />
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-5/6" />
      </div>
      <div className="space-y-2 pt-2">
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-1/2" />
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-2/3" />
        <div className="h-3 bg-[#f4f4ef] rounded animate-pulse w-full" />
      </div>
    </div>
  );
}

function BriefBody({
  brief, showFacts, setShowFacts,
}: {
  brief: NonNullable<BriefResponse["brief"]>;
  showFacts: boolean;
  setShowFacts: (v: boolean) => void;
}) {
  const { prose, fact_sheet, validation } = brief;

  return (
    <div className="space-y-5">
      {/* Briefing — the primary output: conclusions the system drew. */}
      <Section label="Briefing — what we found out for you" emphasis>
        <Markdown text={prose.briefing} onDark />
      </Section>

      {/* Open commitments — structured facts. Always useful when present. */}
      {fact_sheet.open_commitments.length > 0 && (
        <Section label={`Open commitments (${fact_sheet.open_commitments.length})`}>
          <ul className="space-y-1.5">
            {fact_sheet.open_commitments.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${
                  c.direction === "mine_to_them"
                    ? "bg-[#0a0a0a] text-[#c6f24a]"
                    : "bg-[#f4f4ef] text-[#0a0a0a]/70"
                }`}>
                  {c.direction === "mine_to_them" ? "Mine" : "Theirs"}
                </span>
                <span className="flex-1 text-[#0a0a0a]/80">{c.description}</span>
                {c.days_open != null && (
                  <span className="text-[9px] text-[#0a0a0a]/40 shrink-0">{c.days_open}d ago</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Prep actions — only if there's genuine Jose-only work. Empty is fine. */}
      {prose.prep_actions && prose.prep_actions.trim().length > 0 && (
        <Section label="Only you can do">
          <Markdown text={prose.prep_actions} />
        </Section>
      )}

      {/* Opener — only when the LLM found a strong, concrete one */}
      {prose.opener && prose.opener.trim().length > 0 && (
        <Section label="Opener (optional)">
          <p className="text-[11.5px] italic text-[#0a0a0a]/70 leading-relaxed">“{prose.opener}”</p>
        </Section>
      )}

      {/* Validation warnings, if any */}
      {validation.issues.length > 0 && (
        <div className="text-[10px] text-[#0a0a0a]/40 border-l-2 border-[#f4f4ef] pl-3 py-1">
          <p className="font-bold uppercase tracking-widest text-[9px] text-[#0a0a0a]/50">
            Validation ({validation.passed ? "passed" : "blocked"})
          </p>
          <ul className="mt-1 space-y-0.5">
            {validation.issues.map((i, idx) => (
              <li key={idx}>• {i}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Facts drawer */}
      <button
        onClick={() => setShowFacts(!showFacts)}
        className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/40 hover:text-[#0a0a0a]"
      >
        {showFacts ? "Hide" : "Show"} source facts →
      </button>

      {showFacts && (
        <div className="bg-[#FAFAF7] border border-[#f4f4ef] rounded-lg px-4 py-3 text-[10px] text-[#0a0a0a]/65 space-y-1">
          <p><span className="font-bold">Counterpart:</span> {fact_sheet.counterpart.full_name} · resolved via {fact_sheet.counterpart.resolution_method}</p>
          <p><span className="font-bold">Disclosure:</span> {fact_sheet.disclosure.profile_name} · deny={fact_sheet.disclosure.deny.join(", ") || "(nothing)"}</p>
          <p><span className="font-bold">Confidence:</span> intent={fact_sheet.confidence.intent} · overall={fact_sheet.confidence.overall}</p>
          {fact_sheet.warnings.length > 0 && (
            <p className="text-amber-700"><span className="font-bold">Warnings:</span> {fact_sheet.warnings.join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, emphasis, children }: { label: string; emphasis?: boolean; children: React.ReactNode }) {
  return (
    <div className={emphasis ? "bg-[#0a0a0a] text-white rounded-lg px-4 py-3" : ""}>
      <p className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${emphasis ? "text-[#c6f24a]" : "text-[#0a0a0a]/45"}`}>
        {label}
      </p>
      <div className={emphasis ? "[&_p]:text-white [&_p]:italic" : ""}>{children}</div>
    </div>
  );
}

/** Minimal markdown: bullets and bold only. No external dep. */
function Markdown({ text, onDark }: { text: string; onDark?: boolean }) {
  const lines = text.split(/\r?\n/);
  const textColor = onDark ? "text-white/90" : "text-[#0a0a0a]/80";
  const bulletColor = onDark ? "text-[#c6f24a]" : "text-[#0a0a0a]/30";
  return (
    <div className={`space-y-1.5 text-[11.5px] ${textColor} leading-relaxed`}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (/^[-*]\s+/.test(trimmed)) {
          const content = trimmed.replace(/^[-*]\s+/, "");
          return (
            <div key={i} className="flex gap-2">
              <span className={`${bulletColor} mt-0.5 shrink-0`}>•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(content, onDark) }} />
            </div>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: boldify(trimmed, onDark) }} />;
      })}
    </div>
  );
}

function boldify(s: string, onDark?: boolean): string {
  const strongClass = onDark ? "text-white font-semibold" : "text-[#0a0a0a] font-semibold";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, `<strong class="${strongClass}">$1</strong>`);
}

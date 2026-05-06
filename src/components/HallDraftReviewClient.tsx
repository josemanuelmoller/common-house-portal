"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  HallDraft,
  HallDraftAngle,
  HallDraftQuoteCandidate,
  HallDraftTimelineItem,
} from "@/lib/hall-compose";

type Props = {
  projectId:     string;
  initialDraft:  HallDraft | null;
  initialStatus: string;
  generatedAt:   string | null;
  hasLiveHero:   boolean;
};

/**
 * Client editor for hall_draft. All edits are local until "Save" is clicked;
 * Save persists the draft (still pending_review). Publish promotes draft → hero.
 *
 * Designed for Liesbeth-grade scrutiny: every section is reviewable in isolation,
 * regenerate doesn't destroy your manual edits without a confirm, and the
 * quote candidate selector makes the highest-impact decision visual.
 */
export function HallDraftReviewClient({
  projectId, initialDraft, initialStatus, generatedAt, hasLiveHero,
}: Props) {
  const router = useRouter();
  const [draft,  setDraft]  = useState<HallDraft | null>(initialDraft);
  const [status, setStatus] = useState<string>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [busy,  setBusy]  = useState<null | "compose" | "save" | "publish" | "discard">(null);
  const [error, setError] = useState<string | null>(null);
  const [info,  setInfo]  = useState<string | null>(null);

  // ─── Server actions via fetch ────────────────────────────────────────────

  async function compose() {
    if (draft && !confirm("Generate a fresh draft from latest conversations? Your manual edits will be replaced.")) return;
    setBusy("compose"); setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/compose-hall-draft`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error ?? `HTTP ${res.status}`);
        setBusy(null); return;
      }
      setDraft(j.draft as HallDraft);
      setStatus("pending_review");
      setInfo(`Draft generated from ${j.sources_used} source${j.sources_used === 1 ? "" : "s"}.`);
      setTimeout(() => setInfo(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save"); setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/hall-draft`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error ?? `HTTP ${res.status}`);
        setBusy(null); return;
      }
      setInfo("Edits saved.");
      setTimeout(() => setInfo(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!draft) return;
    if (!confirm("Publish this draft to the live Hall? The current live version will be overwritten.")) return;
    setBusy("publish"); setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-hall-draft`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error ?? `HTTP ${res.status}`);
        setBusy(null); return;
      }
      setStatus("published");
      setInfo("Published to /hall/" + projectId);
      startTransition(() => router.refresh());
      setTimeout(() => setInfo(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!confirm("Discard this draft?")) return;
    setBusy("discard"); setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/hall-draft`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error ?? `HTTP ${res.status}`); setBusy(null); return;
      }
      setDraft(null);
      setStatus("discarded");
      setInfo("Draft discarded.");
      startTransition(() => router.refresh());
      setTimeout(() => setInfo(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // ─── Local mutations on the draft ────────────────────────────────────────

  function pickQuoteCandidate(idx: number) {
    if (!draft || !draft.quote?.candidates) return;
    const next = { ...draft, quote: { ...draft.quote.candidates[idx], candidates: draft.quote.candidates } };
    setDraft(next);
  }
  function setQuoteText(text: string) {
    if (!draft || !draft.quote) return;
    setDraft({ ...draft, quote: { ...draft.quote, text } });
  }
  function setAngle(idx: number, patch: Partial<HallDraftAngle>) {
    if (!draft) return;
    const angles = draft.angles.map((a, i) => i === idx ? { ...a, ...patch } : a);
    setDraft({ ...draft, angles });
  }
  function deleteAngle(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, angles: draft.angles.filter((_, i) => i !== idx) });
  }
  function addAngle() {
    if (!draft) return;
    setDraft({ ...draft, angles: [...draft.angles, { title: "", body: "", evidence_excerpt: null, source_id: null }] });
  }
  function setTimelineItem(idx: number, patch: Partial<HallDraftTimelineItem>) {
    if (!draft) return;
    const timeline = draft.timeline.map((t, i) => i === idx ? { ...t, ...patch } : t);
    setDraft({ ...draft, timeline });
  }
  function deleteTimelineItem(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, timeline: draft.timeline.filter((_, i) => i !== idx) });
  }
  function addTimelineItem() {
    if (!draft) return;
    setDraft({
      ...draft,
      timeline: [...draft.timeline, { date: new Date().toISOString().slice(0, 10), label: "", type: "future", source_id: null }],
    });
  }
  function setHallText(field: keyof HallDraft["hall_text"], value: string) {
    if (!draft) return;
    setDraft({ ...draft, hall_text: { ...draft.hall_text, [field]: value || null } });
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!draft) {
    return (
      <div className="space-y-6">
        <FlashStrip status={status} hasLiveHero={hasLiveHero} info={info} error={error} />
        <div
          className="p-12 text-center"
          style={{ border: "1px solid var(--hall-line)" }}
        >
          <p className="text-sm font-bold mb-2" style={{ color: "var(--hall-ink-0)" }}>
            No draft yet
          </p>
          <p className="text-xs mb-6" style={{ color: "var(--hall-muted-3)" }}>
            Generate a draft from this project&apos;s recent conversations. Nothing publishes — you&apos;ll review every section first.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={compose}
            className="hall-btn-primary text-[12px] font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-wait"
            style={{
              background: "var(--hall-ink-0)",
              color: "var(--hall-paper-0)",
              fontFamily: "var(--font-hall-mono)",
              letterSpacing: "0.04em",
            }}
          >
            {busy === "compose" ? "Generating…" : "Generate draft"}
          </button>
        </div>
      </div>
    );
  }

  const candidates = draft.quote?.candidates ?? (draft.quote ? [draft.quote] : []);

  return (
    <div className="space-y-6">
      <FlashStrip status={status} hasLiveHero={hasLiveHero} info={info} error={error} />

      {generatedAt && (
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          DRAFT GENERATED {new Date(generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          {" · "}
          source{draft.meta.generated_from_source_ids.length === 1 ? "" : "s"}: {draft.meta.generated_from_source_ids.length} supabase
          {draft.meta.fireflies_transcript_ids.length > 0 ? ` · ${draft.meta.fireflies_transcript_ids.length} fireflies` : ""}
        </p>
      )}

      {/* ─── Quote ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="QUOTE — pulled-quote hero" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          Verbatim from the counterpart. Pick the one that hits hardest, or edit inline.
        </p>
        <div className="space-y-2">
          {candidates.map((c, i) => {
            const isPicked = draft.quote?.text === c.text && draft.quote?.speaker_name === c.speaker_name;
            return (
              <label
                key={i}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                style={{
                  border: "1px solid var(--hall-line)",
                  background: isPicked ? "var(--hall-fill-soft)" : "var(--hall-paper-0)",
                }}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={isPicked}
                  onChange={() => pickQuoteCandidate(i)}
                />
                <div className="flex-1 min-w-0">
                  {isPicked ? (
                    <textarea
                      value={draft.quote?.text ?? ""}
                      onChange={e => setQuoteText(e.target.value)}
                      rows={3}
                      className="w-full bg-transparent resize-none font-serif italic text-[20px] leading-snug"
                      style={{ color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-display, serif)" }}
                    />
                  ) : (
                    <p className="font-serif italic text-[20px] leading-snug" style={{ color: "var(--hall-ink-0)" }}>
                      &ldquo;{c.text}&rdquo;
                    </p>
                  )}
                  <p
                    className="mt-2"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    — {c.speaker_name}{c.speaker_role ? ` · ${c.speaker_role}` : ""}
                    {c.timestamp_seconds != null ? ` · ${Math.floor(c.timestamp_seconds / 60)}:${String(Math.floor(c.timestamp_seconds % 60)).padStart(2,"0")}` : ""}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* ─── Angles ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="ANGLES — strategic bento" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          The 3 strategic frames the proposal will hit. Each has a punchy uppercase title + 1-2 sentence body.
        </p>
        {draft.angles.map((a, i) => (
          <div
            key={i}
            className="p-4 space-y-2"
            style={{ border: "1px solid var(--hall-line)" }}
          >
            <div className="flex items-center gap-3">
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  color: "var(--hall-muted-3)",
                  fontWeight: 700,
                }}
              >
                ANGLE {String(i + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => deleteAngle(i)}
                className="ml-auto"
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 10,
                  color: "var(--hall-muted-3)",
                }}
              >
                ✕ delete
              </button>
            </div>
            <input
              value={a.title}
              onChange={e => setAngle(i, { title: e.target.value.toUpperCase() })}
              placeholder="ANGLE TITLE"
              className="w-full text-[18px] font-bold tracking-tight"
              style={{ color: "var(--hall-ink-0)", letterSpacing: "0.02em", fontFamily: "var(--font-hall-mono)" }}
            />
            <textarea
              value={a.body}
              onChange={e => setAngle(i, { body: e.target.value })}
              placeholder="1-2 sentences. Anchor to evidence."
              rows={2}
              className="w-full text-[13px] leading-relaxed resize-none"
              style={{ color: "var(--hall-ink-0)" }}
            />
            {a.evidence_excerpt && (
              <p
                className="pt-2"
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 10,
                  color: "var(--hall-muted-2)", borderTop: "1px solid var(--hall-line-soft)",
                }}
              >
                EVIDENCE: &ldquo;{a.evidence_excerpt}&rdquo;
              </p>
            )}
          </div>
        ))}
        {draft.angles.length < 4 && (
          <button
            type="button"
            onClick={addAngle}
            style={{
              fontFamily: "var(--font-hall-mono)", fontSize: 10,
              color: "var(--hall-muted-2)",
            }}
          >
            + add angle
          </button>
        )}
      </section>

      {/* ─── Timeline ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="TIMELINE" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          Past meetings + today + future milestones. Drives the bottom strip of the Hall.
        </p>
        <div className="space-y-2">
          {draft.timeline.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2"
              style={{ border: "1px solid var(--hall-line)" }}
            >
              <input
                type="date"
                value={t.date.slice(0, 10)}
                onChange={e => setTimelineItem(i, { date: e.target.value })}
                className="w-32 text-[12px]"
                style={{ fontFamily: "var(--font-hall-mono)" }}
              />
              <select
                value={t.type}
                onChange={e => setTimelineItem(i, { type: e.target.value as HallDraftTimelineItem["type"] })}
                className="text-[10px] px-2 py-1"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  background: "var(--hall-fill-soft)",
                  fontWeight: 700,
                }}
              >
                <option value="past">PAST</option>
                <option value="today">TODAY</option>
                <option value="future">FUTURE</option>
              </select>
              <input
                value={t.label}
                onChange={e => setTimelineItem(i, { label: e.target.value })}
                placeholder="event label"
                className="flex-1 text-[13px]"
                style={{ color: "var(--hall-ink-0)" }}
              />
              <button
                type="button"
                onClick={() => deleteTimelineItem(i)}
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 10,
                  color: "var(--hall-muted-3)",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addTimelineItem}
          style={{
            fontFamily: "var(--font-hall-mono)", fontSize: 10,
            color: "var(--hall-muted-2)",
          }}
        >
          + add timeline item
        </button>
      </section>

      {/* ─── Hall flat text ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="HALL TEXT — flat fields" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          One or two sentences each. Mirrored to the existing hall_* fields on publish.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            ["welcome_note",   "Welcome note"],
            ["current_focus",  "Current focus"],
            ["challenge",      "Challenge"],
            ["matters_most",   "Matters most"],
            ["next_milestone", "Next milestone"],
            ["obstacles",      "Obstacles"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block">
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 9,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--hall-muted-2)", fontWeight: 700,
                }}
              >
                {label}
              </span>
              <textarea
                value={draft.hall_text[key] ?? ""}
                onChange={e => setHallText(key, e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 text-[13px] leading-relaxed resize-y"
                style={{ border: "1px solid var(--hall-line)", color: "var(--hall-ink-0)" }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* ─── Action bar ────────────────────────────────────────────────── */}
      <div
        className="sticky bottom-0 -mx-9 px-9 py-4 flex items-center gap-3"
        style={{
          background: "var(--hall-paper-0)",
          borderTop: "1px solid var(--hall-ink-0)",
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={busy !== null || pending}
          className="text-[12px] font-bold px-4 py-2 disabled:opacity-50"
          style={{
            border: "1px solid var(--hall-ink-0)",
            color: "var(--hall-ink-0)",
            fontFamily: "var(--font-hall-mono)",
          }}
        >
          {busy === "save" ? "Saving…" : "Save edits"}
        </button>
        <button
          type="button"
          onClick={compose}
          disabled={busy !== null}
          className="text-[12px] font-bold px-4 py-2 disabled:opacity-50"
          style={{
            border: "1px solid var(--hall-line)",
            color: "var(--hall-muted-2)",
            fontFamily: "var(--font-hall-mono)",
          }}
        >
          {busy === "compose" ? "Regenerating…" : "Regenerate"}
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={busy !== null}
          className="text-[12px] font-bold px-4 py-2 disabled:opacity-50"
          style={{
            color: "var(--hall-muted-3)",
            fontFamily: "var(--font-hall-mono)",
          }}
        >
          {busy === "discard" ? "Discarding…" : "Discard"}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={publish}
          disabled={busy !== null}
          className="text-[12px] font-bold px-5 py-2 disabled:opacity-50"
          style={{
            background: "var(--hall-ink-0)",
            color: "var(--hall-paper-0)",
            fontFamily: "var(--font-hall-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {busy === "publish" ? "Publishing…" : "Publish to /hall"}
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2
        style={{
          fontFamily: "var(--font-hall-mono)", fontSize: 10,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--hall-muted-2)", fontWeight: 700,
        }}
      >
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "var(--hall-line)" }} />
    </div>
  );
}

function FlashStrip({
  status, hasLiveHero, info, error,
}: { status: string; hasLiveHero: boolean; info: string | null; error: string | null }) {
  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-2"
        style={{ background: "var(--hall-fill-soft)", border: "1px solid var(--hall-line)" }}
      >
        <span
          style={{
            fontFamily: "var(--font-hall-mono)", fontSize: 10,
            color: "var(--hall-muted-2)", fontWeight: 700, letterSpacing: "0.06em",
          }}
        >
          STATUS
        </span>
        <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 11, color: "var(--hall-ink-0)" }}>
          {status}
        </span>
        <span style={{ color: "var(--hall-muted-3)" }}>·</span>
        <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
          {hasLiveHero ? "live hall published" : "no live hall yet"}
        </span>
      </div>
      {info && (
        <div className="px-4 py-2 text-[11px]" style={{ background: "var(--hall-ok-soft)", color: "var(--hall-ok)" }}>
          {info}
        </div>
      )}
      {error && (
        <div className="px-4 py-2 text-[11px]" style={{ background: "var(--hall-danger-soft)", color: "var(--hall-danger)" }}>
          {error}
        </div>
      )}
    </>
  );
}

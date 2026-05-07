"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HallComposedHero } from "@/components/hall/HallComposedHero";
import type {
  HallDraft,
  HallDraftAngle,
  HallDraftListeningPoint,
  HallDraftProposal,
  HallDraftProposalStatus,
  HallDraftQuoteCandidate,
  HallDraftTimelineItem,
} from "@/lib/hall-compose";
import { withDraftDefaults } from "@/lib/hall-compose";

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
  // Backfill listening + proposal defaults so existing drafts (composed before
  // v2 schema) have editable structures instead of undefined.
  const [draft,  setDraft]  = useState<HallDraft | null>(
    initialDraft ? withDraftDefaults(initialDraft) : null,
  );
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
  function setQuoteField<K extends "text" | "speaker_name" | "speaker_role">(
    field: K,
    value: string,
  ) {
    if (!draft || !draft.quote) return;
    setDraft({ ...draft, quote: { ...draft.quote, [field]: value || null } });
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
  function moveAngle(idx: number, dir: -1 | 1) {
    if (!draft) return;
    const target = idx + dir;
    if (target < 0 || target >= draft.angles.length) return;
    const next = [...draft.angles];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, angles: next });
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
  function moveTimelineItem(idx: number, dir: -1 | 1) {
    if (!draft) return;
    const target = idx + dir;
    if (target < 0 || target >= draft.timeline.length) return;
    const next = [...draft.timeline];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, timeline: next });
  }

  // ─── Listening map ───────────────────────────────────────────────────────
  function setListeningPoint(
    bucket: "heard" | "needed",
    idx: number,
    patch: Partial<HallDraftListeningPoint>,
  ) {
    if (!draft?.listening) return;
    const list = draft.listening[bucket].map((p, i) => i === idx ? { ...p, ...patch } : p);
    setDraft({ ...draft, listening: { ...draft.listening, [bucket]: list } });
  }
  function deleteListeningPoint(bucket: "heard" | "needed", idx: number) {
    if (!draft?.listening) return;
    const list = draft.listening[bucket].filter((_, i) => i !== idx);
    setDraft({ ...draft, listening: { ...draft.listening, [bucket]: list } });
  }
  function addListeningPoint(bucket: "heard" | "needed") {
    if (!draft) return;
    const cur = draft.listening ?? { heard: [], needed: [] };
    const next = { ...cur, [bucket]: [...cur[bucket], { point: "", speaker_name: null, source_id: null }] };
    setDraft({ ...draft, listening: next });
  }
  function moveListeningPoint(bucket: "heard" | "needed", idx: number, dir: -1 | 1) {
    if (!draft?.listening) return;
    const list = draft.listening[bucket];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, listening: { ...draft.listening, [bucket]: next } });
  }

  // ─── Proposal ────────────────────────────────────────────────────────────
  function setProposalField<K extends keyof HallDraftProposal>(
    field: K,
    value: HallDraftProposal[K],
  ) {
    if (!draft) return;
    const cur = draft.proposal ?? {
      status: "draft" as HallDraftProposalStatus,
      summary: null, file_url: null, file_name: null, sent_at: null,
    };
    setDraft({ ...draft, proposal: { ...cur, [field]: value } });
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

      {/* ─── Live preview — what the published Hall hero will look like ──── */}
      <section className="space-y-2">
        <div className="flex items-baseline gap-3">
          <h2
            style={{
              fontFamily: "var(--font-hall-mono)", fontSize: 10,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "var(--hall-muted-2)", fontWeight: 700,
            }}
          >
            Live preview
          </h2>
          <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
            (updates as you edit · not published until you hit Publish)
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--hall-line)" }} />
        </div>
        <div
          className="overflow-hidden"
          style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-0)" }}
        >
          <div style={{ transform: "scale(0.7)", transformOrigin: "top left", width: "142.857%" }}>
            <HallComposedHero hero={draft} projectName="" />
          </div>
        </div>
      </section>

      {/* ─── Quote ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="QUOTE — pulled-quote hero" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          Verbatim from the counterpart. Edit text + attribution below; Claude&apos;s candidates
          are listed underneath as one-click loads.
        </p>

        {/* Always-editable current quote — what actually goes to the hero */}
        <div
          className="p-4 space-y-3"
          style={{
            border: "1px solid var(--hall-ink-0)",
            background: "var(--hall-fill-soft)",
          }}
        >
          <textarea
            value={draft.quote?.text ?? ""}
            onChange={e => setQuoteField("text", e.target.value)}
            placeholder="Quote text…"
            rows={3}
            className="w-full bg-transparent resize-none font-serif italic text-[20px] leading-snug focus:outline-none"
            style={{ color: "var(--hall-ink-0)", fontFamily: "var(--font-hall-display, serif)" }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2" style={{ borderTop: "1px solid var(--hall-line)" }}>
            <label className="block">
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 9,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--hall-muted-2)", fontWeight: 700,
                }}
              >
                Speaker name
              </span>
              <input
                value={draft.quote?.speaker_name ?? ""}
                onChange={e => setQuoteField("speaker_name", e.target.value)}
                placeholder="e.g. Liesbeth van der Meer"
                className="w-full mt-1 px-2 py-1 text-[12px]"
                style={{ border: "1px solid var(--hall-line)", color: "var(--hall-ink-0)" }}
              />
            </label>
            <label className="block">
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 9,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--hall-muted-2)", fontWeight: 700,
                }}
              >
                Speaker role
              </span>
              <input
                value={draft.quote?.speaker_role ?? ""}
                onChange={e => setQuoteField("speaker_role", e.target.value)}
                placeholder="e.g. CFO Oceana Global"
                className="w-full mt-1 px-2 py-1 text-[12px]"
                style={{ border: "1px solid var(--hall-line)", color: "var(--hall-ink-0)" }}
              />
            </label>
          </div>
          {draft.quote?.timestamp_seconds != null && (
            <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
              transcript timestamp · {Math.floor(draft.quote.timestamp_seconds / 60)}:
              {String(Math.floor(draft.quote.timestamp_seconds % 60)).padStart(2, "0")}
            </p>
          )}
        </div>

        {/* Claude-generated candidates — one-click load into current */}
        {candidates.length > 0 && (
          <div className="space-y-2 pt-2">
            <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9, color: "var(--hall-muted-3)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Other candidates from the transcript ({candidates.length})
            </p>
            {candidates.map((c, i) => {
              const isCurrent = draft.quote?.text === c.text;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickQuoteCandidate(i)}
                  disabled={isCurrent}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    border: "1px solid var(--hall-line)",
                    background: "var(--hall-paper-0)",
                    opacity: isCurrent ? 0.45 : 1,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)", fontWeight: 700, marginTop: 2 }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug" style={{ color: "var(--hall-ink-3)" }}>
                      &ldquo;{c.text}&rdquo;
                    </p>
                    <p
                      className="mt-1.5"
                      style={{
                        fontFamily: "var(--font-hall-mono)", fontSize: 9,
                        color: "var(--hall-muted-3)",
                      }}
                    >
                      — {c.speaker_name}{c.speaker_role ? ` · ${c.speaker_role}` : ""}
                      {c.timestamp_seconds != null ? ` · ${Math.floor(c.timestamp_seconds / 60)}:${String(Math.floor(c.timestamp_seconds % 60)).padStart(2,"0")}` : ""}
                      {isCurrent ? " · current" : " · click to load"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveAngle(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 11,
                    color: i === 0 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                    cursor: i === 0 ? "default" : "pointer",
                    padding: "0 6px",
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveAngle(i, 1)}
                  disabled={i === draft.angles.length - 1}
                  title="Move down"
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 11,
                    color: i === draft.angles.length - 1 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                    cursor: i === draft.angles.length - 1 ? "default" : "pointer",
                    padding: "0 6px",
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => deleteAngle(i)}
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 10,
                    color: "var(--hall-muted-3)",
                    paddingLeft: 8,
                  }}
                >
                  ✕ delete
                </button>
              </div>
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
            <div className="pt-2" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
              <label className="block">
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 9,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "var(--hall-muted-3)", fontWeight: 700,
                  }}
                >
                  Evidence excerpt {a.evidence_excerpt ? "" : "(optional)"}
                </span>
                <textarea
                  value={a.evidence_excerpt ?? ""}
                  onChange={e => setAngle(i, { evidence_excerpt: e.target.value || null })}
                  placeholder="Verbatim quote from the source — anchors the angle to evidence."
                  rows={2}
                  className="w-full mt-1 text-[11px] leading-relaxed resize-y"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    color: "var(--hall-muted-2)",
                  }}
                />
              </label>
            </div>
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

      {/* ─── Listening Map (heard / needed) ──────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="LISTENING MAP — lo que escuchamos · lo que se necesita" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          Two short lists that bridge the hero (their words) to the proposal. Heard = what they said about the situation. Needed = what they signaled they need.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["heard", "needed"] as const).map(bucket => {
            const list = draft.listening?.[bucket] ?? [];
            const headerLabel = bucket === "heard" ? "Lo que escuchamos" : "Lo que se necesita";
            return (
              <div key={bucket} className="space-y-2">
                <p
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 9,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "var(--hall-muted-2)", fontWeight: 700,
                  }}
                >
                  {headerLabel}  <span style={{ color: "var(--hall-muted-3)" }}>· {list.length}</span>
                </p>
                {list.map((p, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 space-y-1.5"
                    style={{ border: "1px solid var(--hall-line)" }}
                  >
                    <textarea
                      value={p.point}
                      onChange={e => setListeningPoint(bucket, i, { point: e.target.value })}
                      placeholder={bucket === "heard" ? "What did they say…" : "What do they need…"}
                      rows={2}
                      className="w-full text-[12px] leading-snug resize-none"
                      style={{ color: "var(--hall-ink-0)" }}
                    />
                    <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                      <input
                        value={p.speaker_name ?? ""}
                        onChange={e => setListeningPoint(bucket, i, { speaker_name: e.target.value || null })}
                        placeholder="speaker (opt)"
                        className="flex-1 text-[10px] px-1 py-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                      />
                      <button
                        type="button"
                        onClick={() => moveListeningPoint(bucket, i, -1)}
                        disabled={i === 0}
                        title="Move up"
                        style={{
                          fontFamily: "var(--font-hall-mono)", fontSize: 11,
                          color: i === 0 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                          padding: "0 4px",
                        }}
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => moveListeningPoint(bucket, i, 1)}
                        disabled={i === list.length - 1}
                        title="Move down"
                        style={{
                          fontFamily: "var(--font-hall-mono)", fontSize: 11,
                          color: i === list.length - 1 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                          padding: "0 4px",
                        }}
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => deleteListeningPoint(bucket, i)}
                        style={{
                          fontFamily: "var(--font-hall-mono)", fontSize: 10,
                          color: "var(--hall-muted-3)",
                          paddingLeft: 4,
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addListeningPoint(bucket)}
                  style={{
                    fontFamily: "var(--font-hall-mono)", fontSize: 10,
                    color: "var(--hall-muted-2)",
                  }}
                >
                  + add {bucket}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Proposal ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader label="PROPOSAL — sube tu propuesta" />
        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
          Status + short framing + (later) file upload. The Hall page will show this section after Listening Map.
        </p>
        <div className="p-4 space-y-3" style={{ border: "1px solid var(--hall-line)" }}>
          <label className="block">
            <span
              style={{
                fontFamily: "var(--font-hall-mono)", fontSize: 9,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--hall-muted-2)", fontWeight: 700,
              }}
            >
              Status
            </span>
            <select
              value={draft.proposal?.status ?? "draft"}
              onChange={e => setProposalField("status", e.target.value as HallDraftProposalStatus)}
              className="block mt-1 px-2 py-1 text-[12px]"
              style={{ fontFamily: "var(--font-hall-mono)", border: "1px solid var(--hall-line)" }}
            >
              <option value="draft">draft</option>
              <option value="preparing">preparing</option>
              <option value="ready">ready</option>
              <option value="sent">sent</option>
              <option value="accepted">accepted</option>
            </select>
          </label>
          <label className="block">
            <span
              style={{
                fontFamily: "var(--font-hall-mono)", fontSize: 9,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--hall-muted-2)", fontWeight: 700,
              }}
            >
              Summary
            </span>
            <textarea
              value={draft.proposal?.summary ?? ""}
              onChange={e => setProposalField("summary", e.target.value || null)}
              placeholder="2-3 sentences explaining the proposal at a glance. Shown to the counterpart."
              rows={3}
              className="w-full mt-1 px-3 py-2 text-[13px] leading-relaxed resize-y"
              style={{ border: "1px solid var(--hall-line)", color: "var(--hall-ink-0)" }}
            />
          </label>
          <div
            className="p-3 text-[11px]"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
              background: "var(--hall-fill-soft)",
              border: "1px dashed var(--hall-line)",
            }}
          >
            FILE UPLOAD · coming next
            {draft.proposal?.file_name && (
              <span style={{ color: "var(--hall-ink-0)" }}> · current: {draft.proposal.file_name}</span>
            )}
          </div>
        </div>
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
                onClick={() => moveTimelineItem(i, -1)}
                disabled={i === 0}
                title="Move up"
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 11,
                  color: i === 0 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                  cursor: i === 0 ? "default" : "pointer",
                  padding: "0 4px",
                }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveTimelineItem(i, 1)}
                disabled={i === draft.timeline.length - 1}
                title="Move down"
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 11,
                  color: i === draft.timeline.length - 1 ? "var(--hall-muted-4, #ccc)" : "var(--hall-muted-2)",
                  cursor: i === draft.timeline.length - 1 ? "default" : "pointer",
                  padding: "0 4px",
                }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => deleteTimelineItem(i)}
                style={{
                  fontFamily: "var(--font-hall-mono)", fontSize: 10,
                  color: "var(--hall-muted-3)",
                  paddingLeft: 4,
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
        {hasLiveHero && (
          <a
            href={`/hall?as=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-bold px-4 py-2"
            style={{
              border: "1px solid var(--hall-line)",
              color: "var(--hall-ink-0)",
              fontFamily: "var(--font-hall-mono)",
            }}
          >
            ↗ Preview as client
          </a>
        )}
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

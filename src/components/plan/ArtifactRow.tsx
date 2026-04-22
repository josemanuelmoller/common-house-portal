"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ArtifactQuestion,
  ArtifactStatus,
  ArtifactVersion,
  ObjectiveArtifactWithObjective,
  QuestionStatus,
} from "@/lib/plan";
import { artifactStatusLabel, artifactTypeLabel, calendarEventUrl } from "@/lib/plan";

const STATUS_OPTIONS: ArtifactStatus[] = [
  "draft",
  "in_review",
  "approved",
  "sent",
  "archived",
];

const STATUS_PILL_STYLES: Record<ArtifactStatus, string> = {
  draft: "bg-[#EFEFEA] text-[#131218]",
  in_review: "bg-[#FFF3C4] text-[#8B6F00]",
  approved: "bg-[#B2FF59]/30 text-[#1F5200]",
  sent: "bg-[#131218] text-[#B2FF59]",
  archived: "bg-[#E0E0D8] text-[#6B6B60]",
};

const TIER_PILL_STYLES = {
  high: "bg-[#B2FF59] text-[#131218]",
  mid: "bg-[#FFC773] text-[#131218]",
  low: "bg-[#E0E0D8] text-[#6B6B60]",
} as const;

export function ArtifactRow({ artifact }: { artifact: ObjectiveArtifactWithObjective }) {
  const router = useRouter();
  const [status, setStatus] = useState<ArtifactStatus>(artifact.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<{
    questions: ArtifactQuestion[];
    versions: ArtifactVersion[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  async function handleStatusChange(next: ArtifactStatus) {
    if (next === status) return;
    const previous = status;
    setStatus(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan/artifacts/${artifact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  async function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !details) {
      setLoadingDetails(true);
      try {
        const res = await fetch(`/api/plan/artifacts/${artifact.id}/details`);
        if (res.ok) {
          const data = await res.json();
          setDetails({
            questions: data.questions ?? [],
            versions: data.versions ?? [],
          });
        }
      } finally {
        setLoadingDetails(false);
      }
    }
  }

  const quarter = artifact.objective_quarter
    ? `${artifact.objective_year}-Q${artifact.objective_quarter}`
    : `${artifact.objective_year}`;

  const versionLabel = artifact.latest_version_number
    ? `v${artifact.latest_version_number}`
    : "v—";

  const openCount = artifact.open_questions_count;
  const answeredCount = artifact.answered_questions_count;

  return (
    <div>
      <div className="grid grid-cols-[1.6fr_1.4fr_0.7fr_0.9fr_0.9fr_0.9fr_0.4fr] gap-4 px-5 py-4 items-center hover:bg-[#EFEFEA]/50 transition-colors">
        {/* Objective */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                TIER_PILL_STYLES[artifact.objective_tier]
              }`}
            >
              {artifact.objective_tier}
            </span>
            <span className="text-[9px] font-semibold text-[#6B6B60] uppercase tracking-wider">
              {quarter} · {artifact.objective_area}
            </span>
          </div>
          <span
            className="text-[13px] font-semibold text-[#131218] truncate"
            title={artifact.objective_title}
          >
            {artifact.objective_title}
          </span>
        </div>

        {/* Artifact title + type + version */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
              {artifactTypeLabel(artifact.artifact_type)}
            </span>
            <span className="text-[9px] font-bold text-[#131218] bg-[#EFEFEA] px-1.5 py-0.5 rounded">
              {versionLabel}
            </span>
          </div>
          <span className="text-[13px] text-[#131218] truncate" title={artifact.title}>
            {artifact.title}
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[#C62828] font-semibold">◯ {openCount} open</span>
            <span className="text-[#1F5200] font-semibold">● {answeredCount} answered</span>
          </div>
        </div>

        {/* Created */}
        <div className="text-[11px] text-[#6B6B60]">
          {new Date(artifact.created_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })}
        </div>

        {/* Status dropdown */}
        <div className="flex flex-col gap-1">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as ArtifactStatus)}
            disabled={pending}
            className={`text-[11px] font-semibold px-2 py-1.5 rounded-md border-0 cursor-pointer ${STATUS_PILL_STYLES[status]} ${
              pending ? "opacity-50 cursor-wait" : ""
            }`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {artifactStatusLabel(s)}
              </option>
            ))}
          </select>
          {error && <span className="text-[9px] text-[#C62828]">{error}</span>}
        </div>

        {/* Drive link */}
        <div>
          {artifact.drive_url ? (
            <a
              href={artifact.drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#131218] bg-[#B2FF59] hover:bg-[#a3ef50] px-3 py-1.5 rounded-md transition-colors"
            >
              Open Drive →
            </a>
          ) : (
            <span className="text-[11px] text-[#6B6B60] italic">no link</span>
          )}
        </div>

        {/* Calendar link */}
        <div>
          {artifact.calendar_event_id ? (
            <a
              href={calendarEventUrl(artifact.calendar_event_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#131218] border border-[#131218] hover:bg-[#131218] hover:text-white px-3 py-1.5 rounded-md transition-colors"
            >
              Calendar ↗
            </a>
          ) : (
            <span className="text-[11px] text-[#6B6B60] italic">no block</span>
          )}
        </div>

        {/* Expand toggle */}
        <div className="flex justify-end">
          <button
            onClick={toggleExpand}
            className="text-[14px] font-bold text-[#6B6B60] hover:text-[#131218] w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#EFEFEA] transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bg-[#F7F7F3] border-t border-[#E0E0D8] px-6 py-5">
          {loadingDetails && !details ? (
            <p className="text-[12px] text-[#6B6B60]">Loading questions…</p>
          ) : details ? (
            <ArtifactDetails
              artifactId={artifact.id}
              questions={details.questions}
              versions={details.versions}
              onAnswersChanged={(updated) => {
                setDetails((prev) => (prev ? { ...prev, questions: updated } : prev));
                router.refresh();
              }}
            />
          ) : (
            <p className="text-[12px] text-[#C62828]">Failed to load details.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expanded details panel ─────────────────────────────────────────────────

const MIN_ANSWERS_TO_REGEN = 3;

function ArtifactDetails({
  artifactId,
  questions,
  versions,
  onAnswersChanged,
}: {
  artifactId: string;
  questions: ArtifactQuestion[];
  versions: ArtifactVersion[];
  onAnswersChanged: (next: ArtifactQuestion[]) => void;
}) {
  const router = useRouter();
  const [regenPending, setRegenPending] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenProgress, setRegenProgress] = useState<{
    stage: string;
    chars?: number;
    tokens?: number;
  } | null>(null);
  const [previewVersion, setPreviewVersion] = useState<ArtifactVersion | null>(null);

  const latestVersionNumber = versions[0]?.version_number ?? 1;
  const answeredSinceLatest = questions.filter(
    (q) => q.status === "answered" && q.version_introduced <= latestVersionNumber
  ).length;
  const canRegenerate = answeredSinceLatest >= MIN_ANSWERS_TO_REGEN;

  async function regenerate(force = false) {
    setRegenPending(true);
    setRegenError(null);
    setRegenProgress({ stage: "connecting" });

    try {
      const res = await fetch(`/api/plan/artifacts/${artifactId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      // Non-stream error responses (400 gate, 404 artifact, etc.) still come
      // as JSON with the old shape.
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE: events separated by "\n\n"
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const raw of parts) {
          if (!raw.trim()) continue;
          const lines = raw.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(7).trim();
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          switch (event) {
            case "start":
              setRegenProgress({ stage: "generating" });
              break;
            case "token":
              setRegenProgress({
                stage: "generating",
                chars: typeof data.chars === "number" ? data.chars : undefined,
              });
              break;
            case "parsing":
              setRegenProgress({
                stage: "parsing",
                chars: typeof data.total_chars === "number" ? data.total_chars : undefined,
                tokens: typeof data.tokens === "number" ? data.tokens : undefined,
              });
              break;
            case "saving":
              setRegenProgress({
                stage:
                  typeof data.stage === "string" ? `saving:${data.stage}` : "saving",
              });
              break;
            case "done":
              setRegenProgress(null);
              router.refresh();
              break;
            case "error":
              throw new Error(
                (typeof data.error === "string" ? data.error : "Regeneration failed") +
                  (data.detail ? ` — ${data.detail}` : "")
              );
          }
        }
      }
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegenPending(false);
      setRegenProgress(null);
    }
  }

  const grouped: Record<QuestionStatus, ArtifactQuestion[]> = {
    open: [],
    answered: [],
    dropped: [],
    superseded: [],
  };
  for (const q of questions) grouped[q.status].push(q);

  return (
    <div className="grid grid-cols-[2fr_1fr] gap-6">
      {/* Questions */}
      <div>
        <h3 className="text-[10px] font-bold text-[#6B6B60] uppercase tracking-wider mb-3">
          Questions ({grouped.open.length} open · {grouped.answered.length} answered)
        </h3>
        {grouped.open.length === 0 && grouped.answered.length === 0 && (
          <p className="text-[11px] text-[#6B6B60] italic">
            No questions yet. Next regeneration will surface new ones.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {grouped.open.map((q) => (
            <QuestionCard
              key={q.id}
              artifactId={artifactId}
              question={q}
              onChanged={(updated) =>
                onAnswersChanged(questions.map((x) => (x.id === updated.id ? updated : x)))
              }
            />
          ))}
          {grouped.answered.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] font-bold text-[#6B6B60] uppercase tracking-wider cursor-pointer hover:text-[#131218]">
                {grouped.answered.length} answered — show
              </summary>
              <div className="flex flex-col gap-3 mt-3">
                {grouped.answered.map((q) => (
                  <QuestionCard
                    key={q.id}
                    artifactId={artifactId}
                    question={q}
                    onChanged={(updated) =>
                      onAnswersChanged(questions.map((x) => (x.id === updated.id ? updated : x)))
                    }
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Version history */}
      <div>
        <h3 className="text-[10px] font-bold text-[#6B6B60] uppercase tracking-wider mb-3">
          Version history
        </h3>
        <div className="flex flex-col gap-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className="bg-white border border-[#E0E0D8] rounded-lg p-3 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#131218]">
                  v{v.version_number}
                </span>
                <span className="text-[10px] text-[#6B6B60]">
                  {new Date(v.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {v.summary_of_changes && (
                <p className="text-[11px] text-[#6B6B60]">{v.summary_of_changes}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                {v.drive_url && (
                  <a
                    href={v.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-[#131218] hover:underline"
                  >
                    Drive →
                  </a>
                )}
                {v.content && (
                  <button
                    onClick={() => setPreviewVersion(v)}
                    className="text-[11px] font-semibold text-[#131218] hover:underline"
                  >
                    Preview text
                  </button>
                )}
                {!v.drive_url && v.content && (
                  <span className="text-[9px] text-[#8B6F00] bg-[#FFF3C4] px-1.5 py-0.5 rounded">
                    Drive sync pending
                  </span>
                )}
                {v.tokens_used !== null && v.tokens_used !== undefined && (
                  <span className="text-[9px] text-[#6B6B60] ml-auto">
                    {v.tokens_used.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Regenerate block */}
        <div className="mt-4 p-3 bg-[#131218] rounded-lg flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#B2FF59]">
            Regenerate v{latestVersionNumber + 1}
          </p>
          <p className="text-[10px] leading-relaxed text-white/70">
            {canRegenerate ? (
              <>
                {answeredSinceLatest} answers since v{latestVersionNumber}. The agent will
                integrate them into v{latestVersionNumber + 1} and surface any new questions.
              </>
            ) : (
              <>
                Answer at least {MIN_ANSWERS_TO_REGEN} open questions to regenerate. You have{" "}
                {answeredSinceLatest}/{MIN_ANSWERS_TO_REGEN}.
              </>
            )}
          </p>
          {regenError && (
            <p className="text-[10px] text-[#FF8A80] leading-relaxed">{regenError}</p>
          )}
          {regenProgress && (
            <div className="text-[10px] text-[#B2FF59] leading-relaxed font-mono">
              {regenProgress.stage === "connecting" && "◉ connecting to agent…"}
              {regenProgress.stage === "generating" && (
                <>
                  ◉ generating
                  {typeof regenProgress.chars === "number" &&
                    ` · ${regenProgress.chars.toLocaleString()} chars`}
                </>
              )}
              {regenProgress.stage === "parsing" && (
                <>
                  ◉ parsing
                  {typeof regenProgress.tokens === "number" &&
                    ` · ${regenProgress.tokens.toLocaleString()} tokens`}
                </>
              )}
              {regenProgress.stage.startsWith("saving") && (
                <>◉ saving {regenProgress.stage.split(":")[1] ?? ""}</>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => regenerate(false)}
              disabled={regenPending || !canRegenerate}
              className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] hover:bg-[#a3ef50] disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md"
            >
              {regenPending ? "Working…" : `Regenerate v${latestVersionNumber + 1}`}
            </button>
            {!canRegenerate && (
              <button
                onClick={() => regenerate(true)}
                disabled={regenPending}
                className="text-[10px] font-semibold text-white/80 hover:text-white border border-white/30 px-3 py-1.5 rounded-md"
                title="Bypass the 3-answer minimum (for debugging or when you just want a scope-level rewrite)"
              >
                Force
              </button>
            )}
          </div>
        </div>
      </div>

      {previewVersion && (
        <VersionPreviewModal
          version={previewVersion}
          onClose={() => setPreviewVersion(null)}
        />
      )}
    </div>
  );
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function VersionPreviewModal({
  version,
  onClose,
}: {
  version: ArtifactVersion;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0E0D8]">
          <div>
            <h4 className="text-[14px] font-bold text-[#131218]">
              v{version.version_number} preview
            </h4>
            {version.summary_of_changes && (
              <p className="text-[11px] text-[#6B6B60] mt-1 max-w-xl">
                {version.summary_of_changes}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[16px] text-[#6B6B60] hover:text-[#131218] w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#EFEFEA]"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto px-8 py-7">
          <article className="ch-artifact-prose max-w-none text-[#131218]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {version.content ?? ""}
            </ReactMarkdown>
          </article>
        </div>
        {version.answers_used?.length > 0 && (
          <div className="px-6 py-3 border-t border-[#E0E0D8] bg-[#F7F7F3]">
            <p className="text-[10px] font-bold text-[#6B6B60] uppercase tracking-wider">
              Based on {version.answers_used.length} answer
              {version.answers_used.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single question card ───────────────────────────────────────────────────

function QuestionCard({
  artifactId,
  question,
  onChanged,
}: {
  artifactId: string;
  question: ArtifactQuestion;
  onChanged: (updated: ArtifactQuestion) => void;
}) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isAnswered = question.status === "answered";

  async function save() {
    if (answer.trim().length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/plan/artifacts/${artifactId}/questions/${question.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: answer.trim(), status: "answered" }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      onChanged(data.question);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/plan/artifacts/${artifactId}/questions/${question.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onChanged(data.question);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`bg-white border rounded-xl p-4 flex flex-col gap-2 ${
        isAnswered ? "border-[#B2FF59]/50" : "border-[#E0E0D8]"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`text-[10px] font-bold mt-0.5 ${
            isAnswered ? "text-[#1F5200]" : "text-[#C62828]"
          }`}
        >
          {isAnswered ? "●" : "◯"}
        </span>
        <div className="flex-1">
          <p className="text-[13px] text-[#131218] font-semibold leading-snug">
            {question.question}
          </p>
          {question.rationale && (
            <p className="text-[11px] text-[#6B6B60] mt-1 leading-relaxed italic">
              {question.rationale}
            </p>
          )}
        </div>
        <span className="text-[9px] text-[#6B6B60] whitespace-nowrap">
          v{question.version_introduced}
        </span>
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Tu respuesta…"
        rows={isAnswered ? 2 : 3}
        className="text-[12px] text-[#131218] border border-[#E0E0D8] rounded-md p-2 focus:outline-none focus:border-[#131218] resize-vertical font-sans"
      />

      <div className="flex items-center justify-between gap-2">
        {err && <span className="text-[10px] text-[#C62828]">{err}</span>}
        <div className="flex gap-2 ml-auto">
          {isAnswered ? (
            <>
              <button
                onClick={reopen}
                disabled={saving}
                className="text-[10px] font-semibold text-[#6B6B60] hover:text-[#131218] px-3 py-1.5 rounded-md border border-[#E0E0D8]"
              >
                Re-open
              </button>
              <button
                onClick={save}
                disabled={saving || answer.trim() === (question.answer ?? "")}
                className="text-[10px] font-semibold text-[#131218] bg-[#B2FF59] hover:bg-[#a3ef50] disabled:opacity-50 px-3 py-1.5 rounded-md"
              >
                {saving ? "Saving…" : "Update"}
              </button>
            </>
          ) : (
            <button
              onClick={save}
              disabled={saving || answer.trim().length === 0}
              className="text-[10px] font-semibold text-[#131218] bg-[#B2FF59] hover:bg-[#a3ef50] disabled:opacity-50 px-3 py-1.5 rounded-md"
            >
              {saving ? "Saving…" : "Save answer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

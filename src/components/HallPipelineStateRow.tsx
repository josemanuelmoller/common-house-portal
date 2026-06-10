"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedPipelineRow } from "./HallPipelineState";
import { errorText } from "@/lib/error-text";

const REASON_COLOR: Record<SerializedPipelineRow["reason"], string> = {
  pre_meeting:    "var(--hall-warn)",
  ball_with_jose: "var(--hall-danger)",
  ball_with_them: "var(--hall-warn)",
  drift:          "var(--hall-muted-3)",
  healthy:        "var(--hall-ok)",
};

const TREND_GLYPH: Record<SerializedPipelineRow["trend"], string> = {
  heating: "↗",
  steady:  "→",
  cooling: "↘",
  cold:    "✕",
};

const TREND_COLOR: Record<SerializedPipelineRow["trend"], string> = {
  heating: "var(--hall-ok)",
  steady:  "var(--hall-muted-2)",
  cooling: "var(--hall-warn)",
  cold:    "var(--hall-danger)",
};

type ApiResult<T = Record<string, unknown>> = { ok: true; body: T } | { ok: false; error: string };

type PickerPerson = { notion_id: string; full_name: string | null; email: string | null };

export function HallPipelineStateRow({ row }: { row: SerializedPipelineRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"primary" | "resolve" | "snooze" | "link" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Link-contact picker (drift rows with no linked people)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [people, setPeople] = useState<PickerPerson[] | null>(null);
  const [filter, setFilter] = useState("");

  async function callApi<T = Record<string, unknown>>(path: string, body: object): Promise<ApiResult<T>> {
    setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Prefer the human-readable `note` (honest failure detail) over the
        // code. errorText() guards against platform-shaped error OBJECTS
        // ({code,id,message} on Vercel timeouts) reaching JSX (React #31).
        const o = (j && typeof j === "object") ? j as { note?: unknown; error?: unknown } : {};
        const errorMsg = errorText(o.note, o.error, `HTTP ${res.status}`);
        setErr(errorMsg);
        return { ok: false, error: errorMsg };
      }
      return { ok: true, body: j as T };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setErr(errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function onPrimary() {
    // Link-contact rows open the inline picker instead of calling the
    // draft dispatcher — the fix for "Sin contactos asociados" is the link
    // itself, not a draft that has no recipient.
    if (row.ctaPrimary.action === "link_contact") {
      const next = !pickerOpen;
      setPickerOpen(next);
      if (next && people === null) {
        try {
          const res = await fetch("/api/people-list");
          const j = await res.json().catch(() => ({}));
          setPeople(Array.isArray(j.people) ? j.people : []);
        } catch {
          setPeople([]);
        }
      }
      return;
    }

    setBusy("primary");
    const result = await callApi<{
      ok?: boolean;
      navigate?: boolean;
      queued?: boolean;
      logged?: boolean;
      draftId?: string | null;
      snoozedDays?: number;
      note?: string;
    }>("/api/pipeline-state/draft", {
      entityType: row.entityType,
      entityId:   row.entityId,
      action:     row.ctaPrimary.action,
      payload:    row.ctaPrimary.payload ?? {},
    });
    setBusy(null);
    if (!result.ok) return;

    const b = result.body;
    // Branch by what the server actually did, not just "request succeeded":
    //   navigate=true  → open_prep / open_review — take the user to row.url
    //   queued=true    → draft skill ran — tell the user to check inbox
    //   logged=true    → click recorded (legacy shape; servers now 422 instead)
    if (b.navigate) {
      if (row.url) {
        window.open(row.url, "_blank", "noopener,noreferrer");
      } else {
        flashToast("No hay enlace asociado a esta fila.");
      }
    } else if (b.queued) {
      const who = row.ctaPrimary.payload?.personName;
      flashToast(who ? `Borrador para ${String(who)} encolado. Revísalo en tu bandeja.` : "Borrador encolado. Revísalo en tu bandeja.");
    } else if (b.logged) {
      flashToast(`Anotado. Snooze ${b.snoozedDays ?? 1}d hasta que llegue señal nueva.`);
    }
    router.refresh();
  }

  async function onLinkContact(personNotionId: string) {
    setBusy("link");
    const orgNotionId =
      (typeof row.ctaPrimary.payload?.orgNotionId === "string" && row.ctaPrimary.payload.orgNotionId) ||
      row.entityId;
    const result = await callApi<{ linked?: { person_name?: string | null } }>(
      "/api/hall-organizations/link-contact",
      { org_notion_id: orgNotionId, person_notion_id: personNotionId },
    );
    setBusy(null);
    if (result.ok) {
      setPickerOpen(false);
      flashToast(`✓ ${result.body.linked?.person_name ?? "Contacto"} vinculado a ${row.name}.`);
      router.refresh();
    }
  }

  async function onResolve() {
    setBusy("resolve");
    const result = await callApi("/api/pipeline-state/resolve", {
      entityType: row.entityType,
      entityId:   row.entityId,
      reason:     row.reason,
    });
    setBusy(null);
    if (result.ok) router.refresh();
  }

  async function onSnooze(days: number) {
    setBusy("snooze");
    const result = await callApi("/api/pipeline-state/snooze", {
      entityType: row.entityType,
      entityId:   row.entityId,
      days,
    });
    setBusy(null);
    if (result.ok) router.refresh();
  }

  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <div className="py-3 flex flex-col gap-2">
        {/* Header row: name + meta + CTAs */}
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 mt-1.5"
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: REASON_COLOR[row.reason],
            }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold truncate hover:underline"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {row.name}
                </a>
              ) : (
                <span
                  className="text-[13px] font-semibold truncate"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {row.name}
                </span>
              )}
              <MetaPills row={row} />
              {row.newSignalChip && (
                <span
                  className="uppercase tracking-[0.06em] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 9,
                    color: "var(--hall-ok)",
                    background: "color-mix(in oklab, var(--hall-ok) 12%, transparent)",
                  }}
                >
                  ↻ new signal
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {row.topics.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
                  Temas: {row.topics.join(" · ")}
                </span>
              )}
              {row.ballSummary && (
                <span className="text-[11px]" style={{ color: "var(--hall-ink-2)" }}>
                  {row.ballSummary}
                </span>
              )}
              <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
                <span style={{ color: TREND_COLOR[row.trend], fontWeight: 600, marginRight: 4 }}>
                  {TREND_GLYPH[row.trend]}
                </span>
                {row.reasonDetail}
              </span>
            </div>
          </div>

          {/* CTAs — suppressed on healthy rows (informational only). */}
          {row.reason !== "healthy" && (
            <div className="flex flex-col gap-1.5 items-end shrink-0">
              <button
                type="button"
                onClick={onPrimary}
                disabled={busy !== null}
                className="hall-btn-primary text-[11px] px-2.5 py-1 disabled:opacity-40 whitespace-nowrap"
              >
                {busy === "primary" ? "..." : row.ctaPrimary.label}
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onResolve}
                  disabled={busy !== null}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40 whitespace-nowrap"
                  style={{
                    borderColor: "var(--hall-line)",
                    color: "var(--hall-muted-1)",
                    fontFamily: "var(--font-hall-sans)",
                  }}
                  title="Cierra el loop subyacente y saca esta fila."
                >
                  {busy === "resolve" ? "..." : row.ctaResolveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onSnooze(3)}
                  disabled={busy !== null}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40"
                  style={{
                    borderColor: "var(--hall-line)",
                    color: "var(--hall-muted-1)",
                    fontFamily: "var(--font-hall-sans)",
                  }}
                  title="Oculta esta fila 3 días."
                >
                  Snooze 3d
                </button>
              </div>
            </div>
          )}
          {row.reason === "healthy" && (
            <span
              className="shrink-0 uppercase tracking-[0.08em] font-bold"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 9,
                color: "var(--hall-ok)",
              }}
            >
              ✓ healthy
            </span>
          )}
        </div>

        {/* Inline contact picker — resolution path for "Sin contactos asociados" */}
        {pickerOpen && (
          <div
            className="ml-5 p-2 rounded border flex flex-col gap-1.5"
            style={{ borderColor: "var(--hall-line)", background: "var(--hall-paper-1)" }}
          >
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar persona…"
              className="text-[11px] px-2 py-1 rounded border outline-none"
              style={{ borderColor: "var(--hall-line)", background: "var(--hall-paper-0)", color: "var(--hall-ink-0)" }}
              autoFocus
            />
            {people === null ? (
              <p className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>Cargando contactos…</p>
            ) : (
              <ul className="flex flex-col max-h-44 overflow-y-auto">
                {people
                  .filter(p => {
                    const q = filter.trim().toLowerCase();
                    if (!q) return true;
                    return (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
                  })
                  .slice(0, 8)
                  .map(p => (
                    <li key={p.notion_id}>
                      <button
                        type="button"
                        disabled={busy === "link"}
                        onClick={() => onLinkContact(p.notion_id)}
                        className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-[var(--hall-fill-soft)] disabled:opacity-40"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {p.full_name ?? "(sin nombre)"}
                        {p.email && (
                          <span className="ml-1.5" style={{ color: "var(--hall-muted-2)" }}>{p.email}</span>
                        )}
                      </button>
                    </li>
                  ))}
                {people.length === 0 && (
                  <li className="text-[10px] px-2 py-1" style={{ color: "var(--hall-muted-2)" }}>
                    No se pudieron cargar contactos.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {err && (
          <p className="text-[10px] ml-5" style={{ color: "var(--hall-danger)" }}>
            {err}
          </p>
        )}
        {toast && (
          <p className="text-[10px] ml-5" style={{ color: "var(--hall-muted-1)" }}>
            {toast}
          </p>
        )}
      </div>
    </li>
  );
}

function MetaPills({ row }: { row: SerializedPipelineRow }) {
  const pieces: { text: string; tone?: "default" | "danger" }[] = [];
  pieces.push({ text: row.kind === "client" ? "active client" : "prospect" });
  if (row.oppMeta?.status) pieces.push({ text: row.oppMeta.status.toLowerCase() });
  if (row.oppMeta?.priority) {
    const p = row.oppMeta.priority.split(" ")[0];
    pieces.push({ text: p, tone: p === "P1" ? "danger" : "default" });
  }
  if (row.oppMeta?.valueLabel) pieces.push({ text: row.oppMeta.valueLabel });

  return (
    <span
      className="flex items-center gap-1.5 flex-wrap text-[10.5px]"
      style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
    >
      {pieces.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span style={{ color: "var(--hall-muted-3)" }}>·</span>}
          <span
            style={{
              color: p.tone === "danger" ? "var(--hall-danger)" : undefined,
              fontWeight: p.tone === "danger" ? 700 : undefined,
            }}
          >
            {p.text}
          </span>
        </span>
      ))}
    </span>
  );
}

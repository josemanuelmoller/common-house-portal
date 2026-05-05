"use client";

/**
 * WatchlistEditor — list + inline create + edit + soft-delete for the
 * canonical Supabase `watchlist_entities` table.
 *
 * Routes:
 *   GET    /api/admin/watchlist           → list
 *   POST   /api/admin/watchlist           → create
 *   PATCH  /api/admin/watchlist/[id]      → update
 *   DELETE /api/admin/watchlist/[id]      → soft-archive (payload.archived = true)
 *
 * Mounted on /admin/watchlist. The parent page is server-rendered and
 * passes the initial rows as `initialRows`. After every mutation we update
 * local React state immediately for snappy feedback AND call router.refresh()
 * so any other server-rendered count or listing on the same route stays
 * in sync (per AGENTS.md client-component-refresh-rules).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const WATCH_TYPES = [
  "Competitor",
  "Trend",
  "Regulation",
  "Investor",
  "Funder",
  "Partner",
  "Other",
] as const;

export type WatchlistRow = {
  id: string;
  notion_id: string | null;
  name: string;
  watch_type: string | null;
  url: string | null;
  themes: string[] | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  initialRows: WatchlistRow[];
};

type Draft = {
  name: string;
  watch_type: string;
  url: string;
  themesText: string; // comma-separated
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  watch_type: "",
  url: "",
  themesText: "",
  notes: "",
};

function rowToDraft(r: WatchlistRow): Draft {
  return {
    name: r.name,
    watch_type: r.watch_type ?? "",
    url: r.url ?? "",
    themesText: (r.themes ?? []).join(", "),
    notes: r.notes ?? "",
  };
}

function draftToBody(d: Draft): Record<string, unknown> {
  const themes = d.themesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    name: d.name.trim(),
    watch_type: d.watch_type || null,
    url: d.url || null,
    themes: themes.length > 0 ? themes : null,
    notes: d.notes || null,
  };
}

export function WatchlistEditor({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<WatchlistRow[]>(initialRows);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);

  async function onCreate() {
    setError(null);
    if (!createDraft.name.trim()) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftToBody(createDraft)),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        row?: WatchlistRow;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.row) setRows((prev) => [json.row as WatchlistRow, ...prev]);
      setCreateDraft(EMPTY_DRAFT);
      setCreateOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function onSaveEdit(id: string) {
    setError(null);
    if (!editDraft.name.trim()) {
      setError("Name is required");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/watchlist/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftToBody(editDraft)),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        row?: WatchlistRow;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.row) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? (json.row as WatchlistRow) : r))
        );
      }
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function onArchive(id: string) {
    if (!confirm("Archive this watchlist entry?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/watchlist/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[11px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </p>
        {!createOpen && (
          <button
            type="button"
            className="hall-btn-primary"
            style={{ padding: "6px 12px", fontSize: 11 }}
            onClick={() => setCreateOpen(true)}
          >
            + New entry
          </button>
        )}
      </div>

      {error && (
        <p
          className="text-[11px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          {error}
        </p>
      )}

      {createOpen && (
        <div
          className="p-4 space-y-3"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            borderRadius: 3,
          }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.08em]"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            New watchlist entry
          </p>
          <DraftFields draft={createDraft} setDraft={setCreateDraft} />
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              className="hall-btn-primary"
              style={{ padding: "6px 14px", fontSize: 11, fontFamily: "var(--font-hall-mono)" }}
              onClick={onCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border"
              style={{
                fontFamily: "var(--font-hall-mono)",
                color: "var(--hall-muted-2)",
                borderColor: "var(--hall-line)",
              }}
              onClick={() => {
                setCreateOpen(false);
                setCreateDraft(EMPTY_DRAFT);
                setError(null);
              }}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div
          className="px-4 py-10 text-center"
          style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-1)" }}
        >
          <p
            className="text-[12px]"
            style={{ color: "var(--hall-muted-3)" }}
          >
            No watchlist entries yet.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const editing = editingId === r.id;
            return (
              <li
                key={r.id}
                className="py-3 px-1"
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                {!editing ? (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-semibold"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {r.name}
                      </p>
                      <p
                        className="text-[10.5px] mt-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                      >
                        {r.watch_type && (
                          <span className="uppercase tracking-wide">{r.watch_type}</span>
                        )}
                        {r.url && (
                          <>
                            {r.watch_type && " · "}
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2"
                              style={{ color: "var(--hall-ink-0)" }}
                            >
                              {r.url.replace(/^https?:\/\//, "").slice(0, 50)}
                            </a>
                          </>
                        )}
                        {(r.themes ?? []).length > 0 && (
                          <>
                            {(r.watch_type || r.url) && " · "}
                            {(r.themes ?? []).join(", ")}
                          </>
                        )}
                      </p>
                      {r.notes && (
                        <p
                          className="text-[11.5px] mt-1 italic"
                          style={{ color: "var(--hall-muted-2)" }}
                        >
                          {r.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-ink-0)",
                          borderColor: "var(--hall-ink-0)",
                          background: "transparent",
                        }}
                        onClick={() => {
                          setEditingId(r.id);
                          setEditDraft(rowToDraft(r));
                          setError(null);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-danger)",
                          borderColor: "var(--hall-danger)",
                          background: "transparent",
                        }}
                        onClick={() => onArchive(r.id)}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <DraftFields draft={editDraft} setDraft={setEditDraft} />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        className="hall-btn-primary"
                        style={{ padding: "6px 14px", fontSize: 11, fontFamily: "var(--font-hall-mono)" }}
                        onClick={() => onSaveEdit(r.id)}
                        disabled={savingEdit}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-2)",
                          borderColor: "var(--hall-line)",
                        }}
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft(EMPTY_DRAFT);
                          setError(null);
                        }}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DraftFields({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name (required)">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            style={inputStyle()}
          />
        </Field>
        <Field label="Watch type">
          <select
            value={draft.watch_type}
            onChange={(e) => setDraft({ ...draft, watch_type: e.target.value })}
            style={inputStyle()}
          >
            <option value="">—</option>
            {WATCH_TYPES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL">
          <input
            type="url"
            value={draft.url}
            placeholder="https://…"
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            style={inputStyle()}
          />
        </Field>
        <Field label="Themes (comma-separated)">
          <input
            type="text"
            value={draft.themesText}
            placeholder="reuse, packaging, electronics"
            onChange={(e) => setDraft({ ...draft, themesText: e.target.value })}
            style={inputStyle()}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
    </>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--font-hall-sans)",
    fontSize: 12.5,
    color: "var(--hall-ink-0)",
    background: "var(--hall-paper-0)",
    border: "1px solid var(--hall-line)",
    padding: "7px 9px",
    borderRadius: 3,
    outline: "none",
    width: "100%",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[9.5px] uppercase tracking-[0.08em]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

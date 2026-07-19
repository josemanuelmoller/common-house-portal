"use client";

/**
 * OrganizationRelationships — ADR-001 durable-relationship editor.
 *
 * Shows an org's durable relationships with Common House as natural-language
 * chips ("Portfolio · Acompañada"), and lets an admin add or end one.
 * Relationships are NOT mutually exclusive — an org can be Portfolio AND vendor
 * on a project, etc.
 *
 * On any successful mutation it calls router.refresh() so the server-rendered
 * org page (which reads these rows) re-renders. Display labels are Spanish
 * (matching the product vocabulary); stored values are the English enums.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Relationship = {
  id: string;
  relationship_type: string;
  relationship_state: string | null;
  ended_at: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  portfolio: "Portfolio",
  client: "Cliente",
  partner: "Partner",
  vendor: "Proveedor",
  investor: "Inversionista",
  funder: "Funder",
};

const STATE_LABEL: Record<string, string> = {
  accompanied: "Acompañada",
  followed: "En seguimiento",
  exploring: "Explorando",
  active: "Activa",
  paused: "En pausa",
  not_current: "Inactiva",
  inactive: "Inactiva",
};

// Mirror of RELATIONSHIP_STATES_BY_TYPE (display-only; DB + service enforce truth).
const STATES_BY_TYPE: Record<string, string[]> = {
  portfolio: ["accompanied", "followed"],
  partner: ["exploring", "active", "paused", "not_current"],
  vendor: ["active", "paused", "not_current"],
  investor: ["active", "inactive"],
  funder: ["active", "inactive"],
  client: [],
};

const TYPE_ORDER = ["portfolio", "client", "partner", "vendor", "investor", "funder"];

function chipText(r: Relationship): string {
  const t = TYPE_LABEL[r.relationship_type] ?? r.relationship_type;
  const s = r.relationship_state ? STATE_LABEL[r.relationship_state] ?? r.relationship_state : null;
  return s ? `${t} · ${s}` : t;
}

export function OrganizationRelationships({
  orgId,
  initial,
}: {
  orgId: string;
  initial: Relationship[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("portfolio");
  const [state, setState] = useState<string>("");

  const active = useMemo(
    () =>
      initial
        .filter((r) => !r.ended_at)
        .sort(
          (a, b) => TYPE_ORDER.indexOf(a.relationship_type) - TYPE_ORDER.indexOf(b.relationship_type)
        ),
    [initial]
  );

  const stateOptions = STATES_BY_TYPE[type] ?? [];

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/organizations/${encodeURIComponent(orgId)}/relationships`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            relationship_type: type,
            relationship_state: state || null,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAdding(false);
      setState("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function end(relationshipId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/organizations/${encodeURIComponent(orgId)}/relationships/${relationshipId}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {active.length === 0 && (
          <span className="text-[11.5px] italic" style={{ color: "var(--hall-muted-3)" }}>
            No durable relationship recorded yet.
          </span>
        )}
        {active.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1.5 text-[10px] pl-2 pr-1 py-0.5 uppercase"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              background: "var(--hall-fill-soft)",
              color: "var(--hall-ink-0)",
            }}
          >
            {chipText(r)}
            <button
              type="button"
              aria-label={`End ${chipText(r)}`}
              title="End this relationship (keeps history)"
              onClick={() => end(r.id)}
              disabled={busy}
              className="leading-none px-1"
              style={{ color: "var(--hall-muted-2)", background: "transparent" }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {error && (
        <p
          className="text-[11px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          {error}
        </p>
      )}

      {adding ? (
        <div
          className="flex flex-col sm:flex-row sm:items-end gap-2 p-3"
          style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-line)", borderRadius: 3 }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] uppercase tracking-[0.08em]" style={labelStyle()}>
              Relationship
            </span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setState("");
              }}
              style={inputStyle()}
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] uppercase tracking-[0.08em]" style={labelStyle()}>
              State {type === "client" ? "(n/a for client)" : ""}
            </span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              disabled={stateOptions.length === 0}
              style={inputStyle()}
            >
              <option value="">—</option>
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {STATE_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="hall-btn-primary"
              style={{ padding: "6px 14px", fontSize: 11, fontFamily: "var(--font-hall-mono)" }}
              onClick={add}
              disabled={busy}
            >
              {busy ? "Saving…" : "Add"}
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
                setAdding(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-ink-0)",
            borderColor: "var(--hall-ink-0)",
            background: "transparent",
          }}
          onClick={() => setAdding(true)}
        >
          + Add relationship
        </button>
      )}
    </div>
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
    minWidth: 150,
  };
}

function labelStyle(): React.CSSProperties {
  return { fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" };
}

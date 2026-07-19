"use client";

/**
 * ProjectOrganizationRoles — ADR-001 editor for the organizations participating
 * in a project and their roles (client, delivery_lead, technology_provider, …).
 *
 * Reference case: Auto Mercado's "Estaciones de refill" project =
 *   Auto Mercado → client/sponsor, Common House → delivery_lead,
 *   iRefill → technology_provider.
 *
 * PATCH-free: POST to add a role, DELETE to end one; router.refresh() on success.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = {
  id: string;
  organization_id: string;
  role: string;
  participation_status: string;
  client_visible: boolean;
  ended_at: string | null;
};

type Org = { id: string; name: string };

const ROLES = [
  "client",
  "sponsor",
  "delivery_lead",
  "technology_provider",
  "implementation_partner",
  "co_development_partner",
] as const;

const ROLE_LABEL: Record<string, string> = {
  client: "Cliente",
  sponsor: "Sponsor",
  delivery_lead: "Líder de entrega",
  technology_provider: "Proveedor tecnológico",
  implementation_partner: "Partner de implementación",
  co_development_partner: "Partner de co-desarrollo",
};

export function ProjectOrganizationRoles({
  projectId,
  initial,
  orgs,
}: {
  projectId: string;
  initial: Role[];
  orgs: Org[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? "");
  const [role, setRole] = useState<string>("technology_provider");
  const [clientVisible, setClientVisible] = useState(false);

  const orgName = useMemo(() => {
    const m = new Map(orgs.map((o) => [o.id, o.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [orgs]);

  const active = initial.filter((r) => !r.ended_at);

  async function add() {
    if (!orgId) {
      setError("Pick an organization");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organization_id: orgId, role, client_visible: clientVisible }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function end(roleId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${encodeURIComponent(projectId)}/roles/${roleId}`,
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
      {active.length === 0 ? (
        <p className="text-[11.5px] italic" style={{ color: "var(--hall-muted-3)" }}>
          No participating organizations recorded yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {active.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <span className="text-[12.5px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--hall-ink-0)" }}>
                {orgName(r.organization_id)}
              </span>
              <span
                className="text-[9px] px-2 py-0.5 uppercase tracking-[0.06em]"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontWeight: 700,
                  background: "var(--hall-fill-soft)",
                  color: "var(--hall-ink-0)",
                }}
              >
                {ROLE_LABEL[r.role] ?? r.role}
              </span>
              {r.client_visible && (
                <span
                  className="text-[8.5px] px-1.5 py-0.5 uppercase tracking-[0.06em]"
                  style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-2)", border: "1px solid var(--hall-line)" }}
                  title="Visible to the client in the Room"
                >
                  client-visible
                </span>
              )}
              <button
                type="button"
                onClick={() => end(r.id)}
                disabled={busy}
                title="End this participation (keeps history)"
                className="text-[9px] uppercase tracking-widest px-2 py-0.5"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", background: "transparent" }}
              >
                End
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-[11px]" style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}>
          {error}
        </p>
      )}

      {adding ? (
        <div
          className="flex flex-col sm:flex-row sm:items-end gap-2 p-3"
          style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-line)", borderRadius: 3 }}
        >
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-[9.5px] uppercase tracking-[0.08em]" style={labelStyle()}>Organization</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={inputStyle()}>
              {orgs.length === 0 && <option value="">— no orgs —</option>}
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] uppercase tracking-[0.08em]" style={labelStyle()}>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle()}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2" style={labelStyle()}>
            <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
            <span className="text-[9.5px] uppercase tracking-[0.08em]">Client-visible</span>
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
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", borderColor: "var(--hall-line)" }}
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
          + Add participating organization
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

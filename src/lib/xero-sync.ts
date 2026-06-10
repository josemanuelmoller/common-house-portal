/**
 * xero-sync.ts
 *
 * Pulls Accounts-Receivable (ACCREC) invoices from Xero and upserts them into
 * public.revenue_events (source = 'xero'). This is what makes the plan's
 * `revenue_sum` KPI (src/app/api/plan/compute-kpi/route.ts) reflect real
 * invoiced/paid figures instead of manual entry.
 *
 * Read-only against Xero. Idempotent: upsert ON CONFLICT (source, external_ref)
 * where external_ref = Xero InvoiceID. Re-running re-syncs status transitions
 * (DRAFT → AUTHORISED → PAID) onto the same row.
 */

import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { getXeroAccess, getLastSyncedAt, markSynced } from "@/lib/xero-auth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type?: string; // "ACCREC" | "ACCPAY"
  Status?: string; // DRAFT | SUBMITTED | AUTHORISED | PAID | VOIDED | DELETED
  Total?: number;
  AmountPaid?: number;
  CurrencyCode?: string;
  Reference?: string;
  Date?: string;
  DateString?: string;
  DueDate?: string;
  DueDateString?: string;
  FullyPaidOnDate?: string;
  Contact?: { ContactID?: string; Name?: string };
};

export type XeroSyncResult = {
  ok: boolean;
  reason?: string;
  fetched: number;
  upserted: number;
  skipped: number;
  linked_orgs: number;
  tenant: string | null;
  errors: string[];
};

// Xero returns *String date fields as ISO-ish ("2017-04-28T00:00:00") and the
// non-string variants in MS-AJAX form ("/Date(1493337600000+0000)/"). Prefer the
// string form; fall back to the epoch. Returns YYYY-MM-DD (Postgres `date`) or null.
function toDateOnly(stringVal?: string, msAjaxVal?: string): string | null {
  if (stringVal && /^\d{4}-\d{2}-\d{2}/.test(stringVal)) return stringVal.slice(0, 10);
  const v = stringVal ?? msAjaxVal;
  if (!v) return null;
  const m = /\/Date\((\d+)/.exec(v);
  if (m) {
    const d = new Date(Number(m[1]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function stageFor(status: string | undefined): "sold" | "invoiced" | "paid" | null {
  switch (status) {
    case "DRAFT":
    case "SUBMITTED":
      return "sold";
    case "AUTHORISED":
      return "invoiced";
    case "PAID":
      return "paid";
    default:
      return null; // VOIDED / DELETED / unknown → skip
  }
}

function yearQuarter(dateOnly: string | null): { year: number | null; quarter: number | null } {
  if (!dateOnly) return { year: null, quarter: null };
  const d = new Date(dateOnly);
  if (isNaN(d.getTime())) return { year: null, quarter: null };
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

async function fetchAccRecInvoices(
  accessToken: string,
  tenantId: string,
  modifiedSince: string | null,
  errors: string[]
): Promise<XeroInvoice[]> {
  const all: XeroInvoice[] = [];
  // Hard page cap as a runaway-loop backstop. CH invoice volume is small.
  for (let page = 1; page <= 50; page++) {
    const url =
      `${XERO_API_BASE}/Invoices` +
      `?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}&pageSize=100`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    };
    if (modifiedSince) headers["If-Modified-Since"] = modifiedSince;

    const res = await fetch(url, { headers });
    if (res.status === 304) break; // nothing modified since cursor
    if (res.status === 429) {
      errors.push("xero rate limited (429) — partial sync this run");
      break;
    }
    if (!res.ok) {
      const text = await res.text();
      errors.push(`invoices page ${page} ${res.status}: ${text.slice(0, 200)}`);
      break;
    }
    const json = (await res.json()) as { Invoices?: XeroInvoice[] };
    const batch = json.Invoices ?? [];
    all.push(...batch);
    if (batch.length < 100) break; // last page
  }
  return all;
}

export async function syncXeroRevenue(): Promise<XeroSyncResult> {
  const errors: string[] = [];
  const empty = { fetched: 0, upserted: 0, skipped: 0, linked_orgs: 0, tenant: null };

  const access = await getXeroAccess();
  if (!access.ok) {
    return { ok: false, reason: access.reason, ...empty, errors: access.detail ? [access.detail] : [] };
  }

  const db = supabaseAdmin();

  // Delta cursor: re-pull from 24h before the last successful sync to catch
  // late-arriving status transitions. First run (no cursor) → full pull.
  const lastSynced = await getLastSyncedAt();
  const modifiedSince = lastSynced
    ? new Date(new Date(lastSynced).getTime() - 24 * 3600 * 1000).toISOString()
    : null;

  let invoices: XeroInvoice[];
  try {
    invoices = await fetchAccRecInvoices(access.accessToken, access.tenantId, modifiedSince, errors);
  } catch (e) {
    return {
      ok: false,
      reason: "fetch_failed",
      ...empty,
      tenant: access.tenantName,
      errors: [...errors, e instanceof Error ? e.message : String(e)],
    };
  }

  // org name → id map for best-effort linking. Only a UNIQUE exact (lowercased)
  // name match links; duplicate names resolve to null so we never mislink.
  const { data: orgs } = await db.from("organizations").select("id, name");
  const orgByName = new Map<string, string | null>();
  for (const o of orgs ?? []) {
    const key = (o.name as string | null)?.trim().toLowerCase();
    if (!key) continue;
    orgByName.set(key, orgByName.has(key) ? null : (o.id as string));
  }

  let skipped = 0;
  let linkedOrgs = 0;
  const nowIso = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const inv of invoices) {
    const stage = stageFor(inv.Status);
    if (!stage || !inv.InvoiceID) {
      skipped++;
      continue;
    }

    const invoiceDate = toDateOnly(inv.DateString, inv.Date);
    const dueDate = toDateOnly(inv.DueDateString, inv.DueDate);
    const paidDate = stage === "paid" ? toDateOnly(undefined, inv.FullyPaidOnDate) : null;
    const basis = stage === "paid" ? paidDate ?? invoiceDate : invoiceDate;
    const { year, quarter } = yearQuarter(basis);

    const contactName = inv.Contact?.Name?.trim() ?? "";
    const orgId = contactName ? orgByName.get(contactName.toLowerCase()) ?? null : null;
    if (orgId) linkedOrgs++;

    const amountPaid =
      stage === "paid"
        ? Number(inv.AmountPaid ?? inv.Total ?? 0)
        : inv.AmountPaid != null
        ? Number(inv.AmountPaid)
        : null;

    rows.push({
      source: "xero",
      external_ref: inv.InvoiceID,
      stage,
      amount: Number(inv.Total ?? 0),
      paid_amount: amountPaid,
      currency: inv.CurrencyCode ?? "GBP",
      invoice_number: inv.InvoiceNumber ?? null,
      invoice_date: invoiceDate,
      due_date: dueDate,
      paid_date: paidDate,
      organization_id: orgId,
      year,
      quarter,
      notes: `Xero · ${contactName || "Unknown contact"}${inv.Reference ? " · " + inv.Reference : ""}`,
      updated_at: nowIso,
    });
  }

  let upserted = 0;
  if (rows.length > 0) {
    const { error } = await db
      .from("revenue_events")
      .upsert(rows, { onConflict: "source,external_ref" });
    if (error) errors.push(`revenue_events upsert: ${error.message}`);
    else upserted = rows.length;
  }

  // Only advance the cursor on a clean write — otherwise we'd skip rows we failed
  // to persist on the next run.
  if (errors.length === 0) await markSynced();

  return {
    ok: errors.length === 0,
    fetched: invoices.length,
    upserted,
    skipped,
    linked_orgs: linkedOrgs,
    tenant: access.tenantName,
    errors,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * PATCH /api/admin/company-billing
 * Admin-only. Edits the global Common House billing/payment details (singleton).
 * bank_details is shown in the room only to admins and the client's approver role.
 */
export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : undefined);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const cols: Array<[string, string]> = [
    ["legalName", "legal_name"], ["taxId", "tax_id"], ["address", "address"],
    ["billingEmail", "billing_email"], ["bankDetails", "bank_details"], ["publicNote", "public_note"],
  ];
  for (const [key, col] of cols) {
    const v = str(body[key]);
    if (v !== undefined) update[col] = v;
  }

  const { error } = await supabaseAdmin().from("company_billing").update(update).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}

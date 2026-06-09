import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/offers-create
 *
 * Creates a new Offer or Proposal Brief from the admin Offers page.
 *
 * notion-cutoff-2026-06-02: replaced by canonical writes to `offers` /
 * `proposal_briefs` (Supabase). See docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.2.
 *
 * Body: { docType: "Offer" | "Proposal" | "Scope" | "Amendment" | "Renewal",
 *         description: string, valueEst?: string }
 *
 * Auth: adminGuardApi()
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { docType, description, valueEst } = await req.json();

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  const title  = description.slice(0, 100);
  const nowIso = new Date().toISOString();
  const sb     = getSupabaseServerClient();

  try {
    if (docType === "Offer") {
      // notion-cutoff-2026-06-02: replaced by canonical write to offers
      // await notion.pages.create({
      //   parent: { database_id: DB.offers },
      //   properties: {
      //     "Offer Name":   { title: [{ text: { content: title } }] },
      //     "Offer Status": { select: { name: "In Development" } },
      //     "Notes":        { rich_text: [{ text: { content: `Estimated value: ${valueEst}` } }] },
      //   },
      // });
      // Notion → Supabase mapping (offers):
      //   Offer Name   → title
      //   Offer Status → status
      //   Notes        → payload.notes (no dedicated column yet)
      //   value_est    → payload.value_est_raw (raw string; offer_value left null until parsed)
      const { error } = await sb
        .from("offers")
        .insert({
          title,
          status: "In Development",
          notion_created_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
          payload: {
            notes:          valueEst ? `Estimated value: ${valueEst}` : null,
            value_est_raw:  valueEst ?? null,
            source:         "offers-create",
          },
        });

      if (error) {
        console.error("[offers-create] offers insert failed:", error.message);
        return NextResponse.json({ error: "Supabase error", detail: error.message }, { status: 500 });
      }
    } else {
      // notion-cutoff-2026-06-02: replaced by canonical write to proposal_briefs
      // await notion.pages.create({
      //   parent: { database_id: DB.proposalBriefs },
      //   properties: {
      //     "Title":         { title: [{ text: { content: title } }] },
      //     "Status":        { select: { name: "Draft" } },
      //     "Proposal Type": { select: { name: proposalType } },
      //     "Budget Range":  { rich_text: [{ text: { content: valueEst } }] },
      //   },
      // });
      // Notion → Supabase mapping (proposal_briefs):
      //   Title         → title
      //   Status        → status
      //   Proposal Type → payload.proposal_type
      //   Budget Range  → payload.budget_range
      const proposalType =
        docType === "Proposal" ? "Scoped" :
        docType === "Scope"    ? "Implementation-led" :
        "Exploratory";

      const { error } = await sb
        .from("proposal_briefs")
        .insert({
          title,
          status: "Draft",
          notion_created_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
          payload: {
            proposal_type: proposalType,
            doc_type:      docType,
            budget_range:  valueEst ?? null,
            source:        "offers-create",
          },
        });

      if (error) {
        console.error("[offers-create] proposal_briefs insert failed:", error.message);
        return NextResponse.json({ error: "Supabase error", detail: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("offers-create error:", err);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}

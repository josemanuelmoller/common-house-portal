import { NextResponse } from "next/server";

/**
 * @deprecated Phase 5 of the normalization architecture replaced this
 * route. The Commitments surface now resolves dismissals via
 * POST /api/action-items/:id/resolve (writes to action_items.status).
 *
 * Returns 410 Gone so any stale caller (cached PWA shell, old bookmark)
 * fails loud instead of silently writing to the orphan
 * hall_commitment_dismissals table — which no current reader respects
 * (B-007 audit, 2026-05-18).
 */

function gone() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "This endpoint was removed. Use POST /api/action-items/:id/resolve to dismiss a commitment.",
      replacement: "/api/action-items/:id/resolve",
    },
    { status: 410 },
  );
}

export const PATCH  = gone;
export const DELETE = gone;

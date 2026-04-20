/**
 * GET /api/fireflies-diagnostic
 *
 * Admin-only. Hits the Fireflies GraphQL API directly and surfaces the raw
 * response so we can distinguish between 'no transcripts' / 'API key invalid'
 * / 'wrong account' / 'network error' when the sync returns 0 transcripts.
 *
 * Query params:
 *   days=N — window size for the transcript query (default 14).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";
const FIREFLIES_API = "https://api.fireflies.ai/graphql";

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      env: { FIREFLIES_API_KEY: "MISSING" },
    }, { status: 502 });
  }

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? "14")));
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400_000);

  // Probe 1: who am I? (verifies key + returns account email)
  const whoamiQuery = `query { user { user_id email name } }`;
  let whoami: unknown = null;
  try {
    const res = await fetch(FIREFLIES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: whoamiQuery }),
    });
    whoami = {
      http_status: res.status,
      body: await res.json().catch(() => ({})),
    };
  } catch (err) {
    whoami = { error: err instanceof Error ? err.message : String(err) };
  }

  // Probe 2: transcripts query (same shape the sync uses)
  const listQuery = `
    query List($fromDate: String, $toDate: String) {
      transcripts(fromDate: $fromDate, toDate: $toDate, limit: 50) {
        id title date meeting_link
      }
    }
  `;
  let transcripts: unknown = null;
  try {
    const res = await fetch(FIREFLIES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: listQuery,
        variables: {
          fromDate: from.toISOString(),
          toDate:   now.toISOString(),
        },
      }),
    });
    transcripts = {
      http_status: res.status,
      body: await res.json().catch(() => ({})),
    };
  } catch (err) {
    transcripts = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    ok: true,
    window: { days, fromDate: from.toISOString(), toDate: now.toISOString() },
    env: {
      FIREFLIES_API_KEY_length: apiKey.length,
      FIREFLIES_API_KEY_prefix: apiKey.slice(0, 4) + "…",
    },
    whoami,
    transcripts,
  });
}

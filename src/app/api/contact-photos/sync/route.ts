/**
 * POST /api/contact-photos/sync
 *
 * Batch photo refresher. Picks contacts whose photo_updated_at is stale
 * (or null) and resolves their avatar via Google Contacts → Gravatar →
 * nothing. Skips any row where photo_source='manual' (user-owned).
 *
 * Query params:
 *   ?limit=50  — hard cap on rows processed this run (default 50, max 200)
 *   ?force=1   — ignore freshness window (re-fetch everyone in the limit)
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Cron: monthly, Tuesday 07:00 UTC.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolvePhoto, type PhotoSource } from "@/lib/contact-photos";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

const FRESHNESS_DAYS = 30;

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* no-op */ }
  return false;
}

export async function POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? "50")));
  const force = searchParams.get("force") === "1";

  const sb = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - FRESHNESS_DAYS * 86400_000).toISOString();

  let q = sb
    .from("people")
    .select("id, email, google_resource_name, photo_url, photo_source, photo_updated_at")
    .is("dismissed_at", null)
    .neq("photo_source", "manual")
    .order("photo_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (!force) {
    // Pick rows never scanned OR scanned more than 30 days ago
    q = q.or(`photo_updated_at.is.null,photo_updated_at.lt.${cutoff}`);
  }

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  type Row = { id: string; email: string | null; google_resource_name: string | null; photo_url: string | null; photo_source: PhotoSource | null; photo_updated_at: string | null };
  const queue = (rows ?? []) as Row[];

  const nowIso = new Date().toISOString();
  let google_count = 0, gravatar_count = 0, none_count = 0;

  for (const r of queue) {
    try {
      const res = await resolvePhoto({
        google_resource_name: r.google_resource_name,
        email:                r.email,
        photo_url:            r.photo_url,
        photo_source:         r.photo_source,
      });
      if (res.source === "google_contacts") google_count++;
      else if (res.source === "gravatar")   gravatar_count++;
      else                                   none_count++;
      await sb.from("people").update({
        photo_url:         res.url,
        photo_source:      res.source,
        photo_updated_at:  nowIso,
        updated_at:        nowIso,
      }).eq("id", r.id);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[contact-photos/sync] failed for", r.id, e instanceof Error ? e.message : String(e));
      }
    }
  }

  return NextResponse.json({
    ok:         true,
    processed:  queue.length,
    google:     google_count,
    gravatar:   gravatar_count,
    none:       none_count,
  });
}

// Vercel cron hits endpoints with GET. Alias.
export { POST as GET };

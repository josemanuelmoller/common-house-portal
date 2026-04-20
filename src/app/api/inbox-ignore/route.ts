/**
 * POST /api/inbox-ignore
 *
 * Persistently ignores an inbox thread so it never resurfaces in the
 * Hall > Inbox — needs attention section.
 *
 * Identity: thread_id (strong) + normalized subject + from_email (lineage).
 * A repeat thread with the same normalized subject from the same sender
 * is also suppressed even if Gmail assigns a new thread_id.
 *
 * Auth: admin guard. Mutating route, user-triggered.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/^(\s*(re|fw|fwd|aw|sv|r|f)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { threadId?: string; subject?: string; from?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { threadId, subject, from, reason } = body;
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServerClient();
    const payload = {
      thread_id: threadId,
      subject_norm: subject ? normalizeSubject(subject) : null,
      from_email: from ? from.toLowerCase() : null,
      reason: reason ?? null,
    };
    // upsert on thread_id so a double-click doesn't fail; also guarantees lineage fields stay fresh.
    const { error } = await sb
      .from("inbox_ignores")
      .upsert(payload, { onConflict: "thread_id" });
    if (error) {
      console.error("[inbox-ignore] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[inbox-ignore] Unhandled:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

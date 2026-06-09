/**
 * Server-side helper for writing a row to `public.debug_log` from a server
 * component or server route. Used by /admin section-level error boundaries
 * to capture full stack traces that Vercel runtime logs truncate to ~240
 * chars and that Next.js redacts in production from the error message.
 *
 * Never throws — best-effort write. Caller already has an error; we must
 * not turn a logging miss into a second crash.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type DebugLogInput = {
  source: string;
  url?: string | null;
  message?: string | null;
  stack?: string | null;
  digest?: string | null;
  userEmail?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeDebugLog(input: DebugLogInput): Promise<void> {
  try {
    const sb = getSupabaseServerClient();
    await sb.from("debug_log").insert({
      source: input.source,
      url: input.url ?? null,
      message: input.message ?? null,
      stack: input.stack ?? null,
      digest: input.digest ?? null,
      user_email: input.userEmail ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    // Last-resort log — never let the logger crash.
    console.error("[writeDebugLog] failed to persist:", e);
  }
}

/** Best-effort error → debug_log helper. Pass the source label + the caught error. */
export async function logServerError(source: string, err: unknown, metadata?: Record<string, unknown>): Promise<void> {
  const e = err as Error & { digest?: string };
  await writeDebugLog({
    source,
    message: e?.message ?? String(err),
    stack: e?.stack ?? null,
    digest: e?.digest ?? null,
    metadata: metadata ?? null,
  });
}

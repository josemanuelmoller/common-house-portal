/**
 * Next.js instrumentation entrypoint.
 *
 * `onRequestError` is invoked by Next.js when any server-rendered route
 * throws. Unlike the client-side error.tsx boundary (which only sees the
 * redacted production message "An error occurred in the Server Components
 * render"), this hook receives the actual error message before
 * sanitization — including the digest that Next.js puts on the public
 * error so we can correlate.
 *
 * We persist a row in public.debug_log so we can `SELECT * FROM debug_log
 * ORDER BY occurred_at DESC LIMIT 1` and see the real stack.
 *
 * Doc: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error("[instrumentation] no Supabase creds — error lost:", err);
      return;
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const e = err as Error & { digest?: string };
    await sb.from("debug_log").insert({
      source: "instrumentation.onRequestError",
      url: request?.path ?? null,
      message: e?.message ?? null,
      stack: e?.stack ?? null,
      digest: e?.digest ?? null,
      metadata: {
        name: e?.name ?? null,
        method: request?.method ?? null,
        routePath: context?.routePath ?? null,
        routeType: context?.routeType ?? null,
        renderSource: context?.renderSource ?? null,
        runtime: process.env.NEXT_RUNTIME ?? null,
      },
    });
  } catch (logErr) {
    // Last-resort log; never let the instrumentation itself break the response.
    console.error("[instrumentation] failed to persist error:", logErr);
  }
};

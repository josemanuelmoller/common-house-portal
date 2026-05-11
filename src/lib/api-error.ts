/**
 * Error-response helper for API routes.
 *
 * Why: the audit found that ~50 routes echo `err.message` or `String(err)`
 * directly to the client. Supabase / Notion / fetch errors often include
 * structural hints (column names, constraint names, DB IDs, internal paths)
 * that leak schema info to anyone with access to the endpoint.
 *
 * Pattern:
 *   try {
 *     ...risky work...
 *   } catch (err) {
 *     return apiError(err, { route: "[/api/foo]" });
 *   }
 *
 * The detailed error goes to console.error (visible in Vercel logs only).
 * The client sees a stable, non-leaky message.
 */

import { NextResponse } from "next/server";

export interface ApiErrorOptions {
  /** A short tag for log correlation, e.g. "[/api/foo]" or the function name. */
  route?: string;
  /** Override HTTP status. Default 500. */
  status?: number;
  /** Override the public-facing message. Default "Internal error". */
  publicMessage?: string;
}

export function apiError(err: unknown, opts: ApiErrorOptions = {}): NextResponse {
  const tag = opts.route ?? "[api]";
  // Log the full error server-side. Vercel function logs are scoped to the
  // project; this is the right place for raw error detail.
  // eslint-disable-next-line no-console
  console.error(tag, err);
  return NextResponse.json(
    { error: opts.publicMessage ?? "Internal error" },
    { status: opts.status ?? 500 }
  );
}

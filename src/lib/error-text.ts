/**
 * error-text.ts — coerce ANY error-ish value to a renderable string.
 *
 * Why this exists: API error payloads are not always strings. When a Vercel
 * function hits its time limit, the PLATFORM (not our route) replies with
 * `{"error":{"code":"FUNCTION_INVOCATION_TIMEOUT","id":"…","message":"…"}}`.
 * Components that did `setError(data.error)` and rendered `{error}` fed that
 * object straight into JSX → Minified React error #31 → the page-level error
 * boundary replaced the whole dashboard (seen in prod 2026-06-10 when a prep
 * brief exceeded 60s).
 *
 * Pass candidates in preference order; the first usable one wins.
 */
export function errorText(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (c && typeof c === "object") {
      const o = c as { message?: unknown; code?: unknown };
      if (typeof o.message === "string" && o.message.trim()) return o.message;
      if (typeof o.code === "string" && o.code.trim()) return o.code;
      try {
        const s = JSON.stringify(c);
        if (s && s !== "{}") return s.slice(0, 300);
      } catch { /* circular — keep looking */ }
    }
  }
  return "Unknown error";
}

/** Best-effort error code extraction from string or platform-shaped objects. */
export function errorCode(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const code = (raw as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

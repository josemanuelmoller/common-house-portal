/**
 * SSRF-safe fetch wrapper.
 *
 * Why: routes like /api/garage-ingest and /api/library/ingest-to-tree accept
 * a URL or storagePath from admin input and fetch it server-side. Without
 * filtering, an admin (or a compromised admin session) can point the lambda
 * at cloud metadata services (169.254.169.254), internal RFC1918 ranges,
 * loopback, or non-http schemes like file:// — leaking secrets or enabling
 * lateral movement.
 *
 * Rules enforced:
 *   - scheme must be http or https
 *   - hostname (after DNS resolution when possible) must NOT be:
 *     - loopback (127.0.0.0/8, ::1, 0.0.0.0)
 *     - link-local (169.254.0.0/16) — covers AWS/GCP metadata at .169.254
 *     - RFC1918 private (10/8, 172.16/12, 192.168/16)
 *     - RFC4193 unique local (fc00::/7)
 *   - redirects: caller must opt in. By default we follow up to 3 redirects
 *     and re-validate each hop's destination.
 */

import "server-only";
import { lookup } from "node:dns/promises";

class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`SSRF blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  // 0/8, 10/8, 127/8 reserved/private/loopback
  if (a === 0 || a === 10 || a === 127) return true;
  // 169.254/16 link-local (covers cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168/16
  if (a === 192 && b === 168) return true;
  // 100.64/10 carrier-grade NAT (sometimes used internally)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // fc00::/7 unique local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 link-local
  if (lower.startsWith("fe80")) return true;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — extract IPv4 and re-check
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isPrivateOrLoopbackIPv4(v4mapped[1]);
  return false;
}

async function assertHostnameSafe(hostname: string): Promise<void> {
  if (!hostname) throw new SsrfBlockedError("empty hostname");

  // Reject bracketed/raw IPs that match private ranges without needing DNS.
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare)) {
    if (isPrivateOrLoopbackIPv4(bare)) throw new SsrfBlockedError(`private IPv4 ${bare}`);
    return; // public IPv4 literal is allowed
  }
  if (bare.includes(":")) {
    if (isPrivateOrLoopbackIPv6(bare)) throw new SsrfBlockedError(`private IPv6 ${bare}`);
    return;
  }

  // Localhost shortcut
  if (bare === "localhost" || bare.endsWith(".localhost")) {
    throw new SsrfBlockedError("localhost");
  }

  // DNS-resolve and verify every returned record is public.
  let records: { address: string; family: number }[];
  try {
    records = await lookup(bare, { all: true });
  } catch {
    throw new SsrfBlockedError(`dns resolution failed for ${bare}`);
  }
  for (const r of records) {
    const bad = r.family === 4
      ? isPrivateOrLoopbackIPv4(r.address)
      : isPrivateOrLoopbackIPv6(r.address);
    if (bad) throw new SsrfBlockedError(`resolved to private address ${r.address}`);
  }
}

export interface SafeFetchOptions extends RequestInit {
  /** Max redirects to follow. Each hop is re-validated. Default 3. */
  maxRedirects?: number;
}

/**
 * fetch() but with SSRF guards. Throws SsrfBlockedError if the destination
 * fails the safety checks. All other errors propagate normally.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const { maxRedirects = 3, ...init } = options;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new SsrfBlockedError(`invalid URL ${current}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SsrfBlockedError(`disallowed scheme ${parsed.protocol}`);
    }
    await assertHostnameSafe(parsed.hostname);

    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
      const next = new URL(res.headers.get("location")!, current).toString();
      current = next;
      continue;
    }
    return res;
  }
  throw new SsrfBlockedError(`too many redirects (>${maxRedirects})`);
}

export { SsrfBlockedError };

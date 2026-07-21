/**
 * One-time backfill: harvest real display names from Gmail for people whose
 * people.full_name is an email address (or null/blank) but who are engaged
 * (have meetings, transcripts, or ≥3 email threads).
 *
 * Root cause of the bad names is fixed in the ingestion write paths
 * (src/lib/ingestors/gmail.ts + persist.ts, meeting-classifier.ts). This route
 * repairs the ~319 existing rows.
 *
 * Modes:
 *   POST { dryRun: true }  (DEFAULT) → returns proposals, writes NOTHING
 *   POST { dryRun: false }           → updates full_name + display_name for
 *                                      each proposal, only where the current
 *                                      value is still email-like
 *
 * Params (body OR query string):
 *   dryRun  boolean  default true
 *   limit   number   default 400 — hard cap on total Gmail API calls
 *
 * Auth: adminGuardApi() — admin only (MANDATORY, first line).
 */

import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { apiError } from "@/lib/api-error";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getGoogleGmailClient } from "@/lib/google-gmail";
import { cleanHeaderName, isEmailLikeName } from "@/lib/people-names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 400;
const CANDIDATE_CAP = 2000;

type Candidate = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
};

type Proposal = {
  id: string;
  email: string | null;
  oldName: string | null;
  newName: string;
  source: string;
};

// ─── Header parsing (multi-address aware) ──────────────────────────────────
// gmail.ts only parses a single From name; To/Cc harvesting needs a comma-safe
// splitter that respects quoted display names and angle-bracketed addresses.
function splitAddresses(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
    if (ch === "<") { inAngle = true; cur += ch; continue; }
    if (ch === ">") { inAngle = false; cur += ch; continue; }
    if (ch === "," && !inQuote && !inAngle) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseOneAddress(raw: string): { email: string; name: string | null } {
  const s = raw.trim();
  const angle = s.match(/<([^>]+)>/);
  if (angle) {
    const email = angle[1].trim().toLowerCase();
    let name = s.slice(0, angle.index).trim();
    name = name.replace(/^['"]+|['"]+$/g, "").trim();
    return { email, name: name || null };
  }
  return { email: s.toLowerCase(), name: null };
}

function pairsFromMessage(
  msg: gmail_v1.Schema$Message,
): Array<{ email: string; name: string | null }> {
  const headers = msg.payload?.headers ?? [];
  const get = (n: string) =>
    headers.find((h) => (h.name ?? "").toLowerCase() === n.toLowerCase())?.value ?? "";
  const out: Array<{ email: string; name: string | null }> = [];
  for (const hn of ["From", "To", "Cc"]) {
    const raw = get(hn);
    if (!raw) continue;
    for (const part of splitAddresses(raw)) {
      const p = parseOneAddress(part);
      if (p.email) out.push(p);
    }
  }
  return out;
}

// ─── Param parsing ─────────────────────────────────────────────────────────
function resolveBool(v: unknown, dflt: boolean): boolean {
  if (v === undefined || v === null) return dflt;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  if (s === "true" || s === "1" || s === "yes") return true;
  return dflt;
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    // ─── Params (body overrides query) ──────────────────────────────────
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const dryRun = resolveBool(
      body.dryRun ?? url.searchParams.get("dryRun") ?? undefined,
      true,
    );
    const rawLimit = body.limit ?? url.searchParams.get("limit");
    const limit = Math.max(1, Math.floor(Number(rawLimit)) || DEFAULT_LIMIT);

    const sb = getSupabaseServerClient();

    // ─── a. Active bad-name engaged people ──────────────────────────────
    //   dismissed_at IS NULL
    //   AND (full_name IS NULL OR full_name = '' OR full_name LIKE '%@%')
    //   AND (meeting_count>0 OR transcript_count>0 OR email_thread_count>=3)
    // Two separate .or() groups are AND-ed together by PostgREST.
    const { data: candData, error: candErr } = await sb
      .from("people")
      .select("id, email, full_name, display_name, meeting_count, transcript_count, email_thread_count")
      .is("dismissed_at", null)
      .or("full_name.is.null,full_name.eq.,full_name.ilike.%@%")
      .or("meeting_count.gt.0,transcript_count.gt.0,email_thread_count.gte.3")
      .limit(CANDIDATE_CAP);
    if (candErr) throw candErr;

    const candidates: Candidate[] = (candData ?? []).map((r) => ({
      id: r.id as string,
      email: (r.email as string | null) ?? null,
      full_name: (r.full_name as string | null) ?? null,
      display_name: (r.display_name as string | null) ?? null,
    }));

    // ─── b. Harvest email → display-name dictionary from Gmail ───────────
    const gmail = getGoogleGmailClient();
    if (!gmail) throw new Error("Gmail client unavailable — check GOOGLE_* env vars");

    const dict = new Map<string, string>(); // email(lower) → raw display name
    let calls = 0;

    // Bulk pass: scan recent messages once, harvesting From/To/Cc pairs. Cheap
    // coverage for frequent correspondents. Uses at most ~half the call budget.
    const bulkBudget = Math.min(Math.floor(limit / 2), 150);
    try {
      if (calls < bulkBudget) {
        const list = await gmail.users.messages.list({
          userId: "me",
          q: "newer_than:365d",
          maxResults: 100,
        });
        calls++;
        const ids = (list.data.messages ?? [])
          .map((m) => m.id)
          .filter((x): x is string => typeof x === "string");
        for (const id of ids) {
          if (calls >= bulkBudget) break;
          const msg = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Cc"],
          });
          calls++;
          for (const pair of pairsFromMessage(msg.data)) {
            if (pair.name && !dict.has(pair.email)) dict.set(pair.email, pair.name);
          }
        }
      }
    } catch {
      // Bulk harvest is best-effort; targeted pass below is the workhorse.
    }

    // Targeted pass: for each uncovered target, one `from:<email>` search + one
    // metadata get. Bounded by the remaining call budget.
    for (const c of candidates) {
      if (calls >= limit) break;
      const em = (c.email ?? "").toLowerCase();
      if (!em || !em.includes("@")) continue;
      if (dict.has(em)) continue;
      try {
        const search = await gmail.users.messages.list({
          userId: "me",
          q: `from:${em}`,
          maxResults: 1,
        });
        calls++;
        const mid = search.data.messages?.[0]?.id;
        if (!mid) continue;
        if (calls >= limit) break;
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: mid,
          format: "metadata",
          metadataHeaders: ["From"],
        });
        calls++;
        for (const pair of pairsFromMessage(msg.data)) {
          if (pair.email === em && pair.name && !dict.has(em)) dict.set(em, pair.name);
        }
      } catch {
        continue;
      }
    }

    // ─── c. Build proposals ─────────────────────────────────────────────
    const proposals: Proposal[] = [];
    for (const c of candidates) {
      const em = (c.email ?? "").toLowerCase();
      const raw = em ? dict.get(em) : undefined;
      if (!raw) continue;
      const newName = cleanHeaderName(raw, c.email);
      if (!newName) continue;
      // Only propose when the current name is still email-like/blank.
      if (!isEmailLikeName(c.full_name, c.email)) continue;
      proposals.push({
        id: c.id,
        email: c.email,
        oldName: c.full_name,
        newName,
        source: "gmail",
      });
    }

    // ─── d. Dry run (default) — write nothing ───────────────────────────
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        candidates: candidates.length,
        gmailCalls: calls,
        proposals,
      });
    }

    // ─── e. Execute — update full_name AND display_name ─────────────────
    let updated = 0;
    const failed: string[] = [];
    for (const p of proposals) {
      // Guard again at write time: only overwrite a still-email-like name.
      const { error: updErr } = await sb
        .from("people")
        .update({
          full_name: p.newName,
          display_name: p.newName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .or("full_name.is.null,full_name.eq.,full_name.ilike.%@%");
      if (updErr) failed.push(p.id);
      else updated++;
    }

    return NextResponse.json({
      dryRun: false,
      candidates: candidates.length,
      gmailCalls: calls,
      updated,
      failed: failed.length > 0 ? failed : undefined,
      proposals,
    });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/people/backfill-names]" });
  }
}

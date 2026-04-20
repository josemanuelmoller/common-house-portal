/**
 * GET /api/google/contacts-debug
 *
 * Admin-only diagnostic. Verifies the People API scope is live on the
 * current refresh token and inspects what the API sees.
 *
 * Query params:
 *   email=foo@bar.com   — search for this specific email (both myContacts + otherContacts)
 *                          (defaults: list first 5 saved contacts + first 5 contact groups)
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { getGoogleAuthClient } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const auth = getGoogleAuthClient();
  if (!auth.ok) {
    return NextResponse.json({ error: "no_google_auth", detail: auth }, { status: 502 });
  }
  const people = google.people({ version: "v1", auth: auth.client });
  const email = req.nextUrl.searchParams.get("email");

  const report: Record<string, unknown> = {};

  // 1. Probe the scope by listing contact groups (cheap, high-signal).
  try {
    const g = await people.contactGroups.list({ pageSize: 50 });
    report.contact_groups_count = g.data.contactGroups?.length ?? 0;
    report.contact_group_names = (g.data.contactGroups ?? []).map(x => x.formattedName).slice(0, 30);
    report.scope_ok = true;
  } catch (err) {
    report.scope_ok = false;
    report.scope_error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(report, { status: 502 });
  }

  // 2. If ?email= provided, search both buckets.
  if (email) {
    try {
      const my = await people.people.searchContacts({
        query:    email,
        pageSize: 10,
        readMask: "names,emailAddresses,memberships",
      });
      report.search_myContacts = (my.data.results ?? []).map(r => ({
        name:   r.person?.names?.[0]?.displayName ?? null,
        emails: (r.person?.emailAddresses ?? []).map(e => e.value),
        resourceName: r.person?.resourceName,
        membership_ids: (r.person?.memberships ?? []).map(m => m.contactGroupMembership?.contactGroupResourceName),
      }));
    } catch (err) {
      report.search_myContacts_error = err instanceof Error ? err.message : String(err);
    }
    try {
      const other = await people.otherContacts.search({
        query:    email,
        pageSize: 10,
        readMask: "names,emailAddresses",
      });
      report.search_otherContacts = (other.data.results ?? []).map(r => ({
        name:   r.person?.names?.[0]?.displayName ?? null,
        emails: (r.person?.emailAddresses ?? []).map(e => e.value),
        resourceName: r.person?.resourceName,
      }));
    } catch (err) {
      report.search_otherContacts_error = err instanceof Error ? err.message : String(err);
    }
  } else {
    // No email — list first 5 connections so we can confirm scope sees anything.
    try {
      const conn = await people.people.connections.list({
        resourceName: "people/me",
        pageSize:     5,
        personFields: "names,emailAddresses",
      });
      report.connections_sample_count = conn.data.connections?.length ?? 0;
      report.connections_sample = (conn.data.connections ?? []).map(p => ({
        name:  p.names?.[0]?.displayName ?? null,
        email: p.emailAddresses?.[0]?.value ?? null,
      }));
      report.total_connections = conn.data.totalItems ?? null;
    } catch (err) {
      report.connections_error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(report);
}

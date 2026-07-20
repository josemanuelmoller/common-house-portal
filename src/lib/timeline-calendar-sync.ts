import "server-only";

import { google, type calendar_v3 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "./google-auth";
import { CALENDAR_ID } from "./google-calendar";
import { getSelfEmails } from "./hall-self";

export type TimelineCalendarSyncResult =
  | { ok: true; created: number; updated: number; matched: number; domains: string[] }
  | { ok: false; reason: "no_org" | "no_domain" | "no_google_auth"; missing?: string[] };

function parseDomains(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  } catch { /* not JSON — fall through */ }
  return raw.split(",").map((s) => s.toLowerCase().trim()).filter(Boolean);
}

function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase();
}

/**
 * Pulls the client's meetings from the workspace calendar (matched by the
 * organization's email domain) into the project's timeline as `meeting` events.
 * Idempotent via calendar_event_id. Created events are internal/draft; existing
 * rows keep their visibility (so admin flips to 'client' persist). Never deletes.
 */
export async function syncTimelineMeetingsForProject(
  sb: SupabaseClient,
  projectId: string,
): Promise<TimelineCalendarSyncResult> {
  const { data: proj } = await sb
    .from("projects").select("id, organization_id").eq("id", projectId).maybeSingle();
  if (!proj?.organization_id) return { ok: false, reason: "no_org" };

  const { data: org } = await sb
    .from("organizations").select("org_domains, name").eq("id", proj.organization_id).maybeSingle();
  const domains = parseDomains((org?.org_domains as string | null) ?? null);
  if (!domains.length) return { ok: false, reason: "no_domain" };
  const orgName = (org?.name as string | null) ?? "Cliente";

  const auth = getGoogleAuthClient();
  if (!auth.ok) return { ok: false, reason: "no_google_auth", missing: auth.missing };
  const cal = google.calendar({ version: "v3", auth: auth.client });
  const selfEmails = await getSelfEmails();

  const now = new Date();
  const timeMin = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()).toISOString();

  const events = new Map<string, calendar_v3.Schema$Event>();
  for (const domain of domains) {
    let pageToken: string | undefined;
    do {
      const res = await cal.events.list({
        calendarId: CALENDAR_ID, q: domain, singleEvents: true, orderBy: "startTime",
        timeMin, timeMax, maxResults: 250, pageToken,
      });
      for (const ev of res.data.items ?? []) {
        if (ev.status === "cancelled" || !ev.id || !ev.start?.dateTime) continue;
        const hasDomainAttendee = (ev.attendees ?? []).some((a) => a.email && domainOf(a.email) === domain);
        if (hasDomainAttendee) events.set(ev.id, ev);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  let created = 0;
  let updated = 0;
  for (const ev of events.values()) {
    const eventDate = ev.start!.dateTime!.slice(0, 10);
    const title = (ev.summary ?? "Reunión").trim();
    const attendees = (ev.attendees ?? [])
      .filter((a) => !a.resource && a.email)
      .map((a) => {
        const email = a.email!.toLowerCase();
        const name = a.displayName || email.split("@")[0];
        const side = selfEmails.has(email) ? "Common House" : domains.includes(domainOf(email)) ? orgName : null;
        return side ? `${name} (${side})` : name;
      });
    const isCall = /teams\.microsoft|meet\.google|zoom\.us/i.test((ev.location ?? "") + (ev.hangoutLink ?? ""));
    const location = isCall ? "Videollamada" : (ev.location ?? null);

    const { data: existing } = await sb
      .from("project_timeline_events").select("id")
      .eq("project_id", projectId).eq("calendar_event_id", ev.id!).maybeSingle();

    if (existing) {
      await sb.from("project_timeline_events")
        .update({ event_date: eventDate, title, attendees, location, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      updated++;
    } else {
      await sb.from("project_timeline_events").insert({
        project_id: projectId, calendar_event_id: ev.id, event_date: eventDate, kind: "meeting",
        title, summary: null, attendees, location, visibility: "internal", added_by: "calendar-sync",
      });
      created++;
    }
  }

  return { ok: true, created, updated, matched: events.size, domains };
}

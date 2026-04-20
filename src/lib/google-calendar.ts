/**
 * google-calendar.ts
 * Server-only Google Calendar client factory.
 *
 * Reuses the Gmail OAuth credentials (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET /
 * GMAIL_REFRESH_TOKEN). Requires the refresh token to have calendar scope:
 *   https://www.googleapis.com/auth/calendar.events
 * If the scope is missing, API calls will fail with "insufficient scope" and
 * the feature degrades with a visible error — not a silent failure.
 *
 * Single-user model: writes go to the primary calendar of the Google account
 * that owns the refresh token (i.e. Jose's calendar).
 */

import { google, calendar_v3 } from "googleapis";

export type CalendarClient = calendar_v3.Calendar;

export function getCalendarClient(): CalendarClient | null {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

export const CALENDAR_ID = process.env.TIME_BLOCK_CALENDAR_ID || "primary";

/** Timezone string used for all slot/event computation. IANA name. */
export const HALL_TIMEZONE =
  process.env.HALL_TIMEZONE || "America/Costa_Rica";

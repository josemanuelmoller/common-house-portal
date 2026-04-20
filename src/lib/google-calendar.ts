/**
 * google-calendar.ts
 * Service-specific factory for Google Calendar. Uses the shared auth layer.
 *
 * Required scope on the refresh token:
 *   https://www.googleapis.com/auth/calendar.events
 *
 * Returns null only when the shared auth layer can't construct a client
 * (missing env vars). A present client does NOT guarantee the calendar scope
 * is granted — that is only discovered on the first API call.
 */

import { google, calendar_v3 } from "googleapis";
import { getGoogleAuthClient } from "./google-auth";

export type CalendarClient = calendar_v3.Calendar;

export function getGoogleCalendarClient(): CalendarClient | null {
  const auth = getGoogleAuthClient();
  if (!auth.ok) return null;
  return google.calendar({ version: "v3", auth: auth.client });
}

/** Legacy alias — kept so existing imports (`getCalendarClient`) keep working. */
export const getCalendarClient = getGoogleCalendarClient;

export const CALENDAR_ID = process.env.TIME_BLOCK_CALENDAR_ID || "primary";

/** Default IANA timezone; overridden per-user via hall_preferences.timezone. */
export const HALL_TIMEZONE_DEFAULT =
  process.env.HALL_TIMEZONE || "America/Costa_Rica";

/** Back-compat export used by existing modules. */
export const HALL_TIMEZONE = HALL_TIMEZONE_DEFAULT;

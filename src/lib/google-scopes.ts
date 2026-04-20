/**
 * google-scopes.ts
 * Single source of truth for the OAuth scopes the Common House Portal needs.
 *
 * Why listed together:
 *   The shared refresh token (GMAIL_REFRESH_TOKEN) is used by both Gmail and
 *   Calendar code paths. When we re-consent, we must request ALL scopes in
 *   one grant so a single refresh token carries them all; otherwise a new
 *   consent for Calendar would replace the Gmail grant.
 */

export const GOOGLE_SCOPES_ALL = [
  // Gmail — read inbox, create/send drafts, modify labels
  "https://www.googleapis.com/auth/gmail.modify",
  // Calendar — read availability + list meetings (freebusy + events.list)
  "https://www.googleapis.com/auth/calendar.readonly",
  // Calendar — create/update events (events.insert, events.update)
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export type GoogleScope = typeof GOOGLE_SCOPES_ALL[number];

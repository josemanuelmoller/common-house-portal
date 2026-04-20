/**
 * google-gmail.ts
 * Service-specific factory for Gmail. Uses the shared auth layer.
 *
 * Required scope on the refresh token (read inbox + send replies):
 *   https://www.googleapis.com/auth/gmail.modify
 *
 * Existing Gmail callers (e.g. ingest-gmail/route.ts) instantiate google.gmail
 * inline. This module exists so new code has one canonical path; existing
 * callers can migrate over time without breakage.
 */

import { google, gmail_v1 } from "googleapis";
import { getGoogleAuthClient } from "./google-auth";

export type GmailClient = gmail_v1.Gmail;

export function getGoogleGmailClient(): GmailClient | null {
  const auth = getGoogleAuthClient();
  if (!auth.ok) return null;
  return google.gmail({ version: "v1", auth: auth.client });
}

/** The Gmail account whose inbox/drafts we operate on. */
export const GMAIL_USER_EMAIL = process.env.GMAIL_USER_EMAIL || "";

/**
 * POST /api/send-draft
 *
 * Sends an approved Agent Draft as a Gmail draft (ready to review + send from Gmail)
 * or directly if GMAIL_SEND_MODE=direct is set.
 *
 * Only works for drafts of type: Follow-up Email | Check-in Email
 * LinkedIn Post drafts are skipped (no email target).
 *
 * Requires same Gmail OAuth env vars as /api/ingest-gmail:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER_EMAIL
 *
 * Set GMAIL_SEND_MODE=direct to send immediately instead of creating a draft.
 *
 * Body: { draftId: string }
 * Auth: admin session (Clerk).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

// ─── Gmail auth ───────────────────────────────────────────────────────────────

function getGmailClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

// ─── Build RFC 2822 email message ─────────────────────────────────────────────

function buildRawEmail(opts: {
  from: string; to: string; subject: string; body: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

// ─── Resolve recipient from related entity ────────────────────────────────────

async function resolveRecipient(relatedEntityId: string | null): Promise<string | null> {
  if (!relatedEntityId) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: relatedEntityId }) as any;
    const emailProp = page.properties?.["Email"] ?? page.properties?.["Work Email"];
    return emailProp?.email ?? emailProp?.rich_text?.[0]?.plain_text ?? null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { draftId } = await req.json() as { draftId: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  // Fetch the draft from Notion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.retrieve({ page_id: draftId }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (name: string) => page.properties[name] as any;

  const draftType   = p("Type")?.select?.name ?? "";
  const status      = p("Status")?.select?.name ?? "";
  const draftText   = (p("Draft Text")?.rich_text ?? []).map((r: any) => r.plain_text).join(""); // eslint-disable-line @typescript-eslint/no-explicit-any
  const title       = (p("Title") ?? p("Name"))?.title?.map((r: any) => r.plain_text).join("") ?? ""; // eslint-disable-line @typescript-eslint/no-explicit-any
  const relatedId   = p("Related Entity")?.relation?.[0]?.id ?? null;
  const voice       = p("Voice")?.select?.name ?? "CH";

  // Only email-type drafts
  if (!["Follow-up Email", "Check-in Email"].includes(draftType)) {
    return NextResponse.json({
      ok: false,
      reason: `Draft type "${draftType}" is not an email — send manually.`,
    });
  }

  if (status !== "Approved") {
    return NextResponse.json({ ok: false, reason: "Draft must be Approved before sending." });
  }

  if (!draftText.trim()) {
    return NextResponse.json({ ok: false, reason: "Draft text is empty." });
  }

  const gmail = getGmailClient();
  if (!gmail) {
    return NextResponse.json({
      ok: false,
      reason: "Gmail OAuth not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN to env.",
    });
  }

  const fromEmail = process.env.GMAIL_USER_EMAIL ?? "me";
  const recipient = await resolveRecipient(relatedId);
  const to        = recipient ?? fromEmail; // fallback: send to self if no recipient found
  const subject   = title || `${draftType} — Common House`;
  const sendMode  = process.env.GMAIL_SEND_MODE ?? "draft";

  const raw = buildRawEmail({ from: fromEmail, to, subject, body: draftText });

  try {
    let gmailId: string;

    if (sendMode === "direct") {
      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      gmailId = sent.data.id ?? "";
    } else {
      // Default: create a Gmail draft for review before sending
      const created = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });
      gmailId = created.data.id ?? "";
    }

    // Update Notion draft status
    await notion.pages.update({
      page_id: draftId,
      properties: {
        "Status": { select: { name: sendMode === "direct" ? "Sent" : "Draft Created" } },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    return NextResponse.json({
      ok: true,
      mode: sendMode,
      gmailId,
      to,
      subject,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

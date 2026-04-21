/**
 * POST /api/hall/nudge-draft
 *
 * J4 — Generate a Haiku-authored follow-up email body for a stale thread
 * and create a Gmail DRAFT reply on that thread. The caller (Hall "Waiting
 * on others" widget) then opens the draft in a new tab so Jose can review
 * and send.
 *
 * Body: { threadId, toEmail, toName, subject, snippet, classes, daysWaiting }
 * Returns: { ok: true, draftId, gmailUrl }
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function getGmailClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

type NudgePayload = {
  threadId:    string;
  toEmail:     string;
  toName?:     string;
  subject:     string;
  snippet?:    string;
  classes?:    string[];
  daysWaiting: number;
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: NudgePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { threadId, toEmail, toName, subject, classes, daysWaiting } = body;
  if (!threadId || !toEmail || !subject || typeof daysWaiting !== "number") {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const gmail = getGmailClient();
  if (!gmail) {
    return NextResponse.json({ ok: false, error: "Gmail not configured" }, { status: 503 });
  }

  // 1. Generate the follow-up body with Claude Haiku.
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const classesStr = (classes ?? []).filter(Boolean).join(", ") || "contact";
  const displayName = toName || toEmail.split("@")[0];

  const prompt =
    `Write a concise follow-up email to ${displayName} (${classesStr}) about their last response on '${subject}'. ` +
    `Jose sent the original message ${daysWaiting} days ago. ` +
    `Tone: warm, professional, brief (3-4 sentences). Reference the topic specifically. Sign 'Jose'. ` +
    `Output only the email body — no subject line, no 'Dear X,' greeting (assume recipient is already there), ` +
    `no signature footer beyond 'Jose'.`;

  let draftBody = "";
  try {
    const msg = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = msg.content.find(b => b.type === "text");
    draftBody = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Haiku generation failed", detail: String(err) }, { status: 502 });
  }
  if (!draftBody) {
    return NextResponse.json({ ok: false, error: "Empty draft body from Haiku" }, { status: 502 });
  }

  // 2. Look up the last message's Message-ID to set In-Reply-To / References,
  //    so Gmail threads the draft correctly.
  let inReplyTo = "";
  let references = "";
  try {
    const t = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References"],
    });
    const messages = t.data.messages ?? [];
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      inReplyTo  = last.payload?.headers?.find(h => (h.name ?? "").toLowerCase() === "message-id")?.value ?? "";
      references = last.payload?.headers?.find(h => (h.name ?? "").toLowerCase() === "references")?.value ?? "";
    }
  } catch { /* non-fatal — draft still lands on the thread via threadId */ }

  // 3. Build RFC-822 message and create the Gmail draft on this thread.
  const subjectLine = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const headerLines: string[] = [
    `To: ${toEmail}`,
    `Subject: ${subjectLine}`,
    `Content-Type: text/plain; charset=utf-8`,
  ];
  if (inReplyTo) {
    headerLines.push(`In-Reply-To: ${inReplyTo}`);
    headerLines.push(`References: ${references ? references + " " + inReplyTo : inReplyTo}`);
  }
  const raw = Buffer.from(headerLines.join("\r\n") + "\r\n\r\n" + draftBody, "utf-8").toString("base64url");

  let draftId: string | null = null;
  try {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { threadId, raw } },
    });
    draftId = res.data.id ?? null;
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Gmail draft create failed", detail: String(err) }, { status: 502 });
  }
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "Gmail did not return a draft id" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    draftId,
    gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${draftId}`,
  });
}

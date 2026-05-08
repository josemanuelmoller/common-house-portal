/**
 * POST /api/approve-and-send-draft
 *
 * Phase 2.0 Step 5 — collapses /api/approve-draft + /api/send-draft into one
 * call so /admin/inbox can offer a single button.
 *
 * Flow:
 *   1. Mark draft Approved via mirror (instant Hall reflect + async Notion push)
 *   2. Send via Gmail (draft mode by default; direct mode via GMAIL_SEND_MODE)
 *   3. Mark Sent (or Draft Created) via mirror
 *   4. Record proposal_outcome with action='sent' for control-plane analytics
 *
 * Body: { draftId: string }
 * Auth: admin session (Clerk).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { notion } from "@/lib/notion";
import { updateCanonicalRow } from "@/lib/canonical-write";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { recordProposalOutcome } from "@/lib/proposal-outcomes";
import { currentUser } from "@clerk/nextjs/server";

function getGmailClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

function buildRawEmail(opts: {
  from: string; to: string; subject: string; body: string;
  inReplyTo?: string; references?: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.references ? `${opts.references} ${opts.inReplyTo}` : opts.inReplyTo}`);
  }
  lines.push("", opts.body);
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

async function resolveRecipientFromNotion(relatedEntityId: string | null): Promise<string | null> {
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

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { draftId } = await req.json() as { draftId?: string };
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "draftId required" }, { status: 400 });
  }

  // 1. Load draft from Supabase mirror (faster than Notion + has gmail_thread_id)
  const sb = getSupabaseServerClient();
  const { data: draftRow, error: loadErr } = await sb
    .from("notion_agent_drafts")
    .select("id, title, draft_type, status, draft_text, related_entity_id, gmail_thread_id")
    .eq("id", draftId)
    .maybeSingle();
  if (loadErr || !draftRow) {
    return NextResponse.json(
      { ok: false, error: "Draft not found", detail: loadErr?.message },
      { status: 404 },
    );
  }

  type Row = {
    id: string;
    title: string | null;
    draft_type: string | null;
    status: string | null;
    draft_text: string | null;
    related_entity_id: string | null;
    gmail_thread_id: string | null;
  };
  const draft = draftRow as Row;

  if (!["Follow-up Email", "Check-in Email"].includes(draft.draft_type ?? "")) {
    return NextResponse.json({
      ok: false,
      reason: `Draft type "${draft.draft_type}" is not an email — handle manually.`,
    });
  }
  if (!draft.draft_text?.trim()) {
    return NextResponse.json({ ok: false, reason: "Draft text is empty." });
  }

  // 2. Mark Approved on canonical agent_drafts row.
  const approveResult = await updateCanonicalRow({
    table:   "notion_agent_drafts",
    id:      draftId,
    changes: { status: "Approved" },
  });
  if (!approveResult.ok) {
    return NextResponse.json(
      { ok: false, error: "Draft approve failed", detail: approveResult.error },
      { status: 500 },
    );
  }

  // 3. Build + send via Gmail
  const gmail = getGmailClient();
  if (!gmail) {
    return NextResponse.json({
      ok: false,
      reason: "Gmail OAuth not configured — draft marked Approved but cannot send.",
    });
  }

  const fromEmail = process.env.GMAIL_USER_EMAIL ?? "me";
  const recipient = await resolveRecipientFromNotion(draft.related_entity_id);
  const to        = recipient ?? fromEmail;
  const subject   = draft.title ?? "Reply";
  const sendMode  = process.env.GMAIL_SEND_MODE ?? "draft";

  // For threaded replies, fetch In-Reply-To / References headers from the
  // last message on the thread so Gmail places the response correctly.
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (draft.gmail_thread_id) {
    try {
      const t = await gmail.users.threads.get({
        userId: "me",
        id: draft.gmail_thread_id,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References"],
      });
      const messages = t.data.messages ?? [];
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        inReplyTo = last.payload?.headers?.find(h => (h.name ?? "").toLowerCase() === "message-id")?.value ?? undefined;
        references = last.payload?.headers?.find(h => (h.name ?? "").toLowerCase() === "references")?.value ?? undefined;
      }
    } catch { /* threading metadata best-effort */ }
  }

  const raw = buildRawEmail({
    from: fromEmail, to, subject, body: draft.draft_text,
    inReplyTo, references,
  });

  let gmailId: string;
  try {
    if (sendMode === "direct") {
      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, ...(draft.gmail_thread_id ? { threadId: draft.gmail_thread_id } : {}) },
      });
      gmailId = sent.data.id ?? "";
    } else {
      const created = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw, ...(draft.gmail_thread_id ? { threadId: draft.gmail_thread_id } : {}) },
        },
      });
      gmailId = created.data.id ?? "";
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "Gmail send failed",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 502 });
  }

  // 4. Mark Sent (or Draft Created) on canonical agent_drafts row.
  const newStatus = sendMode === "direct" ? "Sent" : "Draft Created";
  await updateCanonicalRow({
    table:   "notion_agent_drafts",
    id:      draftId,
    changes: { status: newStatus },
  });

  // 5. Record proposal_outcome (fire-and-forget)
  const user = await currentUser();
  void recordProposalOutcome({
    proposal_type: "agent_draft",
    proposal_id:   draftId,
    action:        sendMode === "direct" ? "sent" : "approved",
    agent_name:    draft.draft_type ?? null,
    actor_email:   user?.primaryEmailAddress?.emailAddress ?? null,
    proposal_title: draft.title ?? null,
  });

  return NextResponse.json({
    ok: true,
    mode: sendMode,
    gmailId,
    to,
    subject,
    status: newStatus,
  });
}

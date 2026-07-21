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

async function resolveRecipient(relatedEntityId: string | null): Promise<string | null> {
  if (!relatedEntityId) return null;
  // Read migrated OFF Notion → Supabase `people` (post-cutoff, canonical).
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("people")
      .select("email")
      .eq("notion_id", relatedEntityId)
      .maybeSingle();
    if (data?.email) return data.email as string;
  } catch { /* people lookup unavailable */ }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { draftId } = await req.json() as { draftId?: string };
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "draftId required" }, { status: 400 });
  }

  // 1. Load draft from CANONICAL agent_drafts. (The previous read against the
  //    notion_agent_drafts mirror — frozen since the cutoff — meant this route
  //    404'd for every draft created after 2026-05-05.)
  const sb = getSupabaseServerClient();
  const { data: draftRow, error: loadErr } = await sb
    .from("agent_drafts")
    .select("id, title, draft_type, status, body_md, target_person_notion_id, gmail_thread_id, payload")
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
    body_md: string | null;
    target_person_notion_id: string | null;
    gmail_thread_id: string | null;
    payload: { related_entity_id?: string | null } | null;
  };
  const row = draftRow as Row;
  const draft = {
    id: row.id,
    title: row.title,
    draft_type: row.draft_type,
    status: row.status,
    draft_text: row.body_md,
    related_entity_id: row.payload?.related_entity_id ?? row.target_person_notion_id ?? null,
    gmail_thread_id: row.gmail_thread_id,
  };

  if (!["Follow-up Email", "Check-in Email"].includes(draft.draft_type ?? "")) {
    return NextResponse.json({
      ok: false,
      reason: `Draft type "${draft.draft_type}" is not an email — handle manually.`,
    });
  }
  if (!draft.draft_text?.trim()) {
    return NextResponse.json({ ok: false, reason: "Draft text is empty." });
  }

  // 2. Mark Approved (canonical)
  const { error: approveErr } = await sb
    .from("agent_drafts")
    .update({ status: "Approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", draftId);
  if (approveErr) {
    return NextResponse.json(
      { ok: false, error: "Approve failed", detail: approveErr.message },
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
  const recipient = await resolveRecipient(draft.related_entity_id);
  // Fail loud — never silently address the email to Jose himself.
  if (!recipient) {
    return NextResponse.json({
      ok: false,
      reason: "No se pudo resolver el destinatario de este borrador. Asigna un contacto antes de enviar.",
    }, { status: 422 });
  }
  const to      = recipient;
  const subject = draft.title ?? "Reply";
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

  // 4. Mark Sent (or Draft Created) — canonical
  const newStatus = sendMode === "direct" ? "Sent" : "Draft Created";
  const { error: sentErr } = await sb
    .from("agent_drafts")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", draftId);
  if (sentErr) {
    // Email already left the building — log, don't fail the user.
    console.warn("[approve-and-send-draft] status update failed:", sentErr.message);
  }

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

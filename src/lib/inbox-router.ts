/**
 * inbox-router.ts — Fase 4
 *
 * Routes a classified inbox_item to its destination table when confidence is
 * high enough. Today: only `reminder` items with a due date land in
 * `chief_of_staff_tasks`. Other types stay in the inbox awaiting user action;
 * Fase 4.5 may add more destinations (reference assets, evidence, etc.).
 */

import { getSupabaseServerClient } from "./supabase-server";
import type { InboxItem } from "./inbox";

const REMINDER_DEFAULT_DAYS = 3; // user-confirmed default for reminders without explicit due date

export async function routeClassifiedItem(item: InboxItem): Promise<void> {
  if (item.agent_type === "reminder") {
    await routeReminderToTasks(item);
  }
  // Future: reference → reference_assets, client-message → linked_org follow-up, …
}

async function routeReminderToTasks(item: InboxItem): Promise<void> {
  const sb = getSupabaseServerClient();

  const due = pickDueAt(item);
  const title = composeTitle(item);

  const { data: created, error } = await sb
    .from("chief_of_staff_tasks")
    .insert({
      title,
      task_status: "Open",
      signal_type: "inbox_reminder",
      due_at: due,
      notes: composeNotes(item),
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`tasks insert: ${error?.message || "unknown"}`);
  }

  await sb
    .from("inbox_items")
    .update({
      routed_to_table: "chief_of_staff_tasks",
      routed_to_id: created.id,
      routed_at: new Date().toISOString(),
      status: "pending_action",
    })
    .eq("id", item.id);
}

function pickDueAt(item: InboxItem): string {
  // Priority order: user-set due > agent-set due > default +N days
  const explicit = item.user_due_date || item.agent_due_date;
  if (explicit) {
    // Date string → end of day in UTC. Pragmatic — we don't know the user's TZ
    // at classification time. Hall preferences can refine later.
    return new Date(`${explicit}T23:59:00Z`).toISOString();
  }
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + REMINDER_DEFAULT_DAYS);
  fallback.setUTCHours(23, 59, 0, 0);
  return fallback.toISOString();
}

function composeTitle(item: InboxItem): string {
  const text = (item.raw_text || item.transcript || "Recordatorio").trim();
  // Take the first sentence-ish chunk; cap at 100 chars
  const firstLine = text.split(/[\n.!?]/).find((s) => s.trim().length > 0) || text;
  return firstLine.trim().slice(0, 100);
}

function composeNotes(item: InboxItem): string {
  const lines: string[] = [];
  if (item.raw_text) lines.push(item.raw_text);
  if (item.user_notes_to_agent) {
    lines.push(`\n— Comentario al agente: ${item.user_notes_to_agent}`);
  }
  if (item.agent_reasoning) {
    lines.push(`\n— Clasificación: ${item.agent_reasoning}`);
  }
  lines.push(`\n— Origen: inbox_item ${item.id}`);
  return lines.join("\n");
}

"use server"

import { requireAdminAction } from "@/lib/require-admin"
import { notion } from "@/lib/notion"
import { revalidatePath } from "next/cache"

export async function approveDecision(id: string) {
  await requireAdminAction()
  await notion.pages.update({
    page_id: id,
    properties: {
      "Execute Approved": { checkbox: true },
    },
  })
  revalidatePath("/admin/decisions")
}

export async function resolveDecision(id: string) {
  await requireAdminAction()
  await notion.pages.update({
    page_id: id,
    properties: {
      "Status": { select: { name: "Resolved" } },
    },
  })
  revalidatePath("/admin/decisions")
}

export async function dismissDecision(id: string) {
  await requireAdminAction()
  await notion.pages.update({
    page_id: id,
    properties: {
      "Status": { select: { name: "Dismissed" } },
    },
  })
  revalidatePath("/admin/decisions")
}

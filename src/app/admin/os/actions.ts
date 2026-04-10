"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { notion } from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";

export async function validateEvidence(evidenceId: string) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Unauthorized");

  await notion.pages.update({
    page_id: evidenceId,
    properties: {
      "Validation Status": {
        select: { name: "Validated" },
      },
    },
  });

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}

export async function rejectEvidence(evidenceId: string) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Unauthorized");

  await notion.pages.update({
    page_id: evidenceId,
    properties: {
      "Validation Status": {
        select: { name: "Rejected" },
      },
    },
  });

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}

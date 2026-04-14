"use server"

import { requireAdminAction } from "@/lib/require-admin"
import { notion } from "@/lib/notion"
import { revalidatePath } from "next/cache"

/** Notion rich_text blocks are capped at 2000 chars each. Split long strings into chunks. */
function toRichText(content: string) {
  const CHUNK = 2000
  const chunks: string[] = []
  for (let i = 0; i < content.length; i += CHUNK) chunks.push(content.slice(i, i + CHUNK))
  return chunks.map(c => ({ type: "text" as const, text: { content: c } }))
}

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

/**
 * resolveAndUpdate — for "Missing Input" Decision Items created by agents with a [ENTITY_ID:xxx] marker.
 * 1. Reads the entity's current Notes field from Notion.
 * 2. Appends the user's input (so existing data is preserved).
 * 3. Writes back to the entity's Notes field.
 * 4. Leaves a comment on the Decision Item for traceability.
 * 5. Marks Decision Item as Resolved.
 *
 * The next agent run will read the updated Notes and can compute the match score.
 */
export async function resolveAndUpdate(
  id: string, entityId: string, note: string, field = "Notes"
): Promise<{ error?: string }> {
  await requireAdminAction()
  const trimmed = note.trim()
  if (!trimmed) return { error: "El texto no puede estar vacío." }

  try {
    // Read existing value of the target field so we append rather than overwrite
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
    const existingValue: string =
      (entityPage.properties?.[field]?.rich_text ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.plain_text)
        .join("") ?? ""

    const updatedValue = existingValue
      ? `${existingValue}\n\n[Decision Center — ${new Date().toISOString().slice(0, 10)}]\n${trimmed}`
      : trimmed

    // Write back to entity at the target field (chunked to stay within Notion's 2000-char block limit)
    await notion.pages.update({
      page_id: entityId,
      properties: {
        [field]: { rich_text: toRichText(updatedValue) },
      },
    })

    // Comment on Decision Item for audit trail (non-blocking — comment permissions may not be enabled)
    const commentText = `Human input written to entity ${entityId}:\n${trimmed}`.slice(0, 2000)
    try {
      await notion.comments.create({
        parent: { page_id: id },
        rich_text: [{ type: "text", text: { content: commentText } }],
      })
    } catch { /* comment permissions optional — safe to ignore */ }

    // Resolve Decision Item
    await notion.pages.update({
      page_id: id,
      properties: { Status: { select: { name: "Resolved" } } },
    })

    revalidatePath("/admin/decisions")
    return {}
  } catch (err) {
    console.error("[resolveAndUpdate] Notion error:", err)
    const msg = err instanceof Error ? err.message
      : (err as { message?: string })?.message
      ?? JSON.stringify(err)
    return { error: msg }
  }
}

export async function resolveWithNote(id: string, note: string) {
  await requireAdminAction()
  const trimmed = note.trim()
  if (!trimmed) throw new Error("Note is empty")
  try {
    await notion.comments.create({
      parent: { page_id: id },
      rich_text: [{ type: "text", text: { content: `Human input:\n${trimmed}` } }],
    })
  } catch { /* comment permissions optional */ }
  await notion.pages.update({
    page_id: id,
    properties: {
      "Status": { select: { name: "Resolved" } },
    },
  })
  revalidatePath("/admin/decisions")
}

/**
 * resolveWithSearch — for "Missing Input" Decision Items where the resolution is a Notion relation.
 *
 * Used when an agent cannot auto-link a record (e.g. source-intake can't determine project linkage).
 * The user types a search query; we find the matching record in the target DB and write the relation.
 *
 * Flow:
 * 1. Search searchDb for a record whose title contains searchQuery.
 * 2. Write relation [{ id: foundPageId }] to fieldName on entityId.
 * 3. If the entity has a "Relevance Status" field, set it to "Relevant".
 * 4. Comment on Decision Item for audit trail.
 * 5. Mark Decision Item as Resolved.
 *
 * Throws if no match is found (caller shows the error, user can retry with a different query).
 */
export async function resolveWithSearch(
  decisionId: string,
  entityId: string,
  fieldName: string,
  searchQuery: string,
  searchDb: string,
) {
  await requireAdminAction()
  const trimmed = searchQuery.trim()
  if (!trimmed) throw new Error("Escribe un nombre para buscar.")

  // Bug 2 fix: read the DB schema to find the actual title property name (varies per DB)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbSchema = await notion.databases.retrieve({ database_id: searchDb }) as any
  const titlePropName =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(dbSchema.properties as Record<string, any>).find(([, v]) => v.type === "title")?.[0] ?? "Name"

  const results = await notion.databases.query({
    database_id: searchDb,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: { property: titlePropName, title: { contains: trimmed } } as any,
    page_size: 5,
  })

  if (results.results.length === 0) {
    throw new Error(`No se encontró ningún registro que contenga "${trimmed}". Prueba con otro nombre.`)
  }

  const found = results.results[0] as { id: string; url: string }

  // Bug 3 fix: read existing relations and append — never overwrite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
  const existingRelations: { id: string }[] = entityPage.properties?.[fieldName]?.relation ?? []
  // Deduplicate: skip if this page is already linked
  const alreadyLinked = existingRelations.some(r => r.id === found.id)
  const newRelations = alreadyLinked ? existingRelations : [...existingRelations, { id: found.id }]

  await notion.pages.update({
    page_id: entityId,
    properties: {
      [fieldName]: { relation: newRelations },
    },
  })

  // Also try to update Relevance Status to Relevant (source records only — ignore error if field absent)
  try {
    await notion.pages.update({
      page_id: entityId,
      properties: { "Relevance Status": { select: { name: "Relevant" } } },
    })
  } catch {
    // Field may not exist on this entity type — safe to ignore
  }

  // Comment on Decision Item for audit trail (non-blocking)
  try {
    await notion.comments.create({
      parent: { page_id: decisionId },
      rich_text: [{ type: "text", text: { content: `Relation written: ${fieldName} → "${trimmed}" (${found.id})` } }],
    })
  } catch { /* comment permissions optional */ }

  // Resolve Decision Item
  await notion.pages.update({
    page_id: decisionId,
    properties: { Status: { select: { name: "Resolved" } } },
  })

  revalidatePath("/admin/decisions")
}

/**
 * searchNotionEntities — Fix 1 (legacy items without relatedEntityId).
 * Searches across CH Organizations + CH People + CH Projects using Notion's
 * full-text search. Returns enough info to let the user pick the right record
 * directly in the portal, without visiting Notion.
 */
export async function searchNotionEntities(query: string): Promise<{ id: string; name: string; dbType: string }[]> {
  await requireAdminAction()
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const results = await notion.search({
    query: trimmed,
    filter: { object: "page" },
    page_size: 8,
  })

  return results.results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((page: any) => {
      // Extract title from whichever property has type=title
      const titleProp = Object.values(page.properties ?? {})
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .find((p: any) => p.type === "title") as any
      const name: string = titleProp?.title?.[0]?.plain_text ?? "Sin título"
      // Infer DB type from parent database_id
      const dbId: string = page.parent?.database_id?.replace(/-/g, "") ?? ""
      const DB_LABELS: Record<string, string> = {
        "bef1bb86ab2b4cd280b6b33f9034b96c": "Organización",
        "1bc0f96f33ca4a9e9ff26844377e81de": "Persona",
      }
      return { id: page.id as string, name, dbType: DB_LABELS[dbId] ?? "Registro" }
    })
    .filter(r => r.name !== "Sin título")
}

/**
 * previewRelationTarget — Fix 2 (preview before committing a relation link).
 * Read-only: finds the matching record but does NOT write anything.
 * Returns the found record so the user can confirm before linking.
 */
export async function previewRelationTarget(
  searchQuery: string,
  searchDb: string,
): Promise<{ id: string; name: string; url: string } | null> {
  await requireAdminAction()
  const trimmed = searchQuery.trim()
  if (!trimmed) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbSchema = await notion.databases.retrieve({ database_id: searchDb }) as any
  const titlePropName =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(dbSchema.properties as Record<string, any>).find(([, v]) => (v as any).type === "title")?.[0] ?? "Name"

  const results = await notion.databases.query({
    database_id: searchDb,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: { property: titlePropName, title: { contains: trimmed } } as any,
    page_size: 3,
  })

  if (results.results.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = results.results[0] as any
  const titleProp = Object.values(page.properties ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .find((p: any) => p.type === "title") as any
  const name: string = titleProp?.title?.[0]?.plain_text ?? "Sin título"
  return { id: page.id, name, url: page.url }
}

/**
 * resolveAndUpdateMulti — Fix 4 (multiple fields in one submit).
 * Writes each {field, value} pair to the entity, then resolves the Decision Item.
 */
export async function resolveAndUpdateMulti(
  id: string,
  entityId: string,
  fields: { field: string; value: string }[],
) {
  await requireAdminAction()
  if (fields.length === 0) throw new Error("No fields provided")
  if (fields.every(f => !f.value.trim())) throw new Error("All fields are empty")

  const date = new Date().toISOString().slice(0, 10)

  for (const { field, value } of fields) {
    const trimmed = value.trim()
    if (!trimmed) continue // skip blank optional fields

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
    const existing: string =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entityPage.properties?.[field]?.rich_text ?? []).map((r: any) => r.plain_text).join("") ?? ""

    const updated = existing
      ? `${existing}\n\n[Decision Center — ${date}]\n${trimmed}`
      : trimmed

    await notion.pages.update({
      page_id: entityId,
      properties: { [field]: { rich_text: toRichText(updated) } },
    })
  }

  const summary = fields.filter(f => f.value.trim()).map(f => `${f.field}: ${f.value.trim()}`).join(" | ")
  const multiComment = `Multi-field input written to entity ${entityId}:\n${summary}`.slice(0, 2000)
  try {
    await notion.comments.create({
      parent: { page_id: id },
      rich_text: [{ type: "text", text: { content: multiComment } }],
    })
  } catch { /* comment permissions optional */ }

  await notion.pages.update({
    page_id: id,
    properties: { Status: { select: { name: "Resolved" } } },
  })
  revalidatePath("/admin/decisions")
}

/**
 * resolveWithRelationId — writes a relation using the already-confirmed target page ID.
 * Used by the DecisionActions relation flow after the user previews and confirms a record.
 * Safer than resolveWithSearch because it doesn't re-search Notion (no risk of a different match).
 */
export async function resolveWithRelationId(
  decisionId: string,
  entityId: string,
  fieldName: string,
  targetPageId: string,
) {
  await requireAdminAction()

  // Read existing relations and append — never overwrite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
  const existingRelations: { id: string }[] = entityPage.properties?.[fieldName]?.relation ?? []
  const alreadyLinked = existingRelations.some(r => r.id === targetPageId)
  const newRelations = alreadyLinked ? existingRelations : [...existingRelations, { id: targetPageId }]

  await notion.pages.update({
    page_id: entityId,
    properties: {
      [fieldName]: { relation: newRelations },
    },
  })

  // Also try to update Relevance Status to Relevant (source records only — ignore error if absent)
  try {
    await notion.pages.update({
      page_id: entityId,
      properties: { "Relevance Status": { select: { name: "Relevant" } } },
    })
  } catch {
    // Field may not exist on this entity type — safe to ignore
  }

  // Comment on Decision Item for audit trail (non-blocking)
  try {
    await notion.comments.create({
      parent: { page_id: decisionId },
      rich_text: [{ type: "text", text: { content: `Relation written: ${fieldName} → ${targetPageId}` } }],
    })
  } catch { /* comment permissions optional */ }

  // Resolve Decision Item
  await notion.pages.update({
    page_id: decisionId,
    properties: { Status: { select: { name: "Resolved" } } },
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

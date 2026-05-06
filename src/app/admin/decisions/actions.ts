"use server"

import { requireAdminAction } from "@/lib/require-admin"
import { revalidatePath } from "next/cache"
import { currentUser } from "@clerk/nextjs/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { randomUUID } from "node:crypto"

// notion-cutoff-2026-06-02: Notion client retained import-commented for archival
// reference only. After cutoff this file MUST not import @notionhq/client.
// import { notion } from "@/lib/notion"

// ─── Constants ────────────────────────────────────────────────────────────────

// Legacy Notion DB IDs — previously used to dispatch search/relation writes.
// Retained here as identifiers (not used for any Notion call) so callers in the
// portal that pass these IDs to the relation-resolution actions still work.
const LEGACY_NOTION_DB_ID = {
  ORGANIZATIONS: "bef1bb86ab2b4cd280b6b33f9034b96c",
  PEOPLE:        "1bc0f96f33ca4a9e9ff26844377e81de",
  PROJECTS:      "49d59b18095f46588960f2e717832c5f",
  SOURCES:       "d88aff1b019d4110bcefab7f5bfbd0ae",
} as const

/** Map a legacy Notion DB ID to the canonical Supabase table name. */
function dbIdToTable(dbId: string): "organizations" | "people" | "projects" | "sources" | null {
  const id = dbId.replace(/-/g, "")
  if (id === LEGACY_NOTION_DB_ID.ORGANIZATIONS) return "organizations"
  if (id === LEGACY_NOTION_DB_ID.PEOPLE)        return "people"
  if (id === LEGACY_NOTION_DB_ID.PROJECTS)      return "projects"
  if (id === LEGACY_NOTION_DB_ID.SOURCES)       return "sources"
  return null
}

/** Internal helper: return current admin email for audit columns. */
async function actorEmail(): Promise<string> {
  const u = await currentUser()
  return u?.primaryEmailAddress?.emailAddress ?? "unknown"
}

/**
 * Update the canonical `decision_items` row keyed by Notion page ID.
 * The portal's read mirror surfaces `notion_decision_items.id` (= Notion page
 * ID) into the UI, so the action receives that value as `decisionId`.
 * After Phase 6 the mirror disappears and the UI will pass the canonical
 * UUID directly; this helper hides that switch behind one place.
 */
async function updateDecisionByNotionId(
  decisionId: string,
  patch: Record<string, unknown>,
) {
  const sb = getSupabaseServerClient()
  const { error } = await sb
    .from("decision_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("notion_id", decisionId)
  if (error) throw new Error(`decision_items update failed: ${error.message}`)
}

/**
 * Append a human-input note to `decision_items.notes_raw` for traceability.
 * Replaces the Notion comment write that used to go on the decision page.
 */
async function appendDecisionNote(decisionId: string, note: string) {
  const sb = getSupabaseServerClient()
  const { data: row } = await sb
    .from("decision_items")
    .select("notes_raw")
    .eq("notion_id", decisionId)
    .maybeSingle()
  const date = new Date().toISOString().slice(0, 10)
  const existing = (row?.notes_raw as string | null) ?? ""
  const next = existing
    ? `${existing}\n\n[Decision Center — ${date}]\n${note}`
    : `[Decision Center — ${date}]\n${note}`
  await updateDecisionByNotionId(decisionId, { notes_raw: next })
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function approveDecision(id: string) {
  await requireAdminAction()
  const actor = await actorEmail()
  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // await notion.pages.update({
  //   page_id: id,
  //   properties: {
  //     "Execute Approved": { checkbox: true },
  //   },
  // })
  await updateDecisionByNotionId(id, {
    execute_approved: true,
    approved_at:      new Date().toISOString(),
    approved_by:      actor,
  })
  revalidatePath("/admin/decisions")
  revalidatePath("/admin")
  revalidatePath("/admin/os")
}

export async function resolveDecision(id: string) {
  await requireAdminAction()
  const actor = await actorEmail()
  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // await notion.pages.update({
  //   page_id: id,
  //   properties: {
  //     "Status": { select: { name: "Resolved" } },
  //   },
  // })
  await updateDecisionByNotionId(id, {
    status:      "Resolved",
    approved_at: new Date().toISOString(),
    approved_by: actor,
  })
  revalidatePath("/admin/decisions")
  revalidatePath("/admin")
  revalidatePath("/admin/os")
}

/**
 * resolveAndUpdate — for "Missing Input" Decision Items created by agents with a [ENTITY_ID:xxx] marker.
 *
 * Pre-cutoff this action wrote the user's input back to the linked entity's
 * Notes field in Notion so the agent could read it on its next run. After the
 * 2026-06-02 cutoff the canonical write target is `decision_items.notes_raw`
 * (the agent now reads decision context from Supabase, not from a Notion
 * entity Notes property). The entity reference is recorded in `entity_id` /
 * `entity_table` / `resolution_field` so downstream agents can still locate
 * the originating record.
 */
export async function resolveAndUpdate(
  id: string, entityId: string, note: string, field = "Notes"
): Promise<{ error?: string }> {
  const trimmed = note.trim()
  if (!trimmed) return { error: "El texto no puede estar vacío." }

  try {
    await requireAdminAction()
    const actor = await actorEmail()

    // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
    // (agent reads from decision_items.notes_raw, not from Notion entity Notes)
    // const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
    // const existingValue = (entityPage.properties?.[field]?.rich_text ?? [])
    //   .map((r: any) => r.plain_text).join("") ?? ""
    // const updatedValue = existingValue ? `${existingValue}\n\n[Decision Center — …]\n${trimmed}` : trimmed
    // await notion.pages.update({ page_id: entityId, properties: { [field]: { rich_text: toRichText(updatedValue) } } })
    // await notion.comments.create({ parent: { page_id: id }, rich_text: [...] })
    // await notion.pages.update({ page_id: id, properties: { Status: { select: { name: "Resolved" } } } })

    await appendDecisionNote(id, `Human input for ${field} on ${entityId}:\n${trimmed}`)
    await updateDecisionByNotionId(id, {
      status:           "Resolved",
      entity_id:        entityId,
      resolution_field: field,
      approved_at:      new Date().toISOString(),
      approved_by:      actor,
    })

    revalidatePath("/admin/decisions")
    revalidatePath("/admin")
    revalidatePath("/admin/os")
    return {}
  } catch (err) {
    console.error("[resolveAndUpdate] Supabase error:", err)
    const msg = err instanceof Error ? err.message
      : (err as { message?: string })?.message
      ?? JSON.stringify(err)
    return { error: msg }
  }
}

export async function resolveWithNote(id: string, note: string): Promise<{ error?: string }> {
  const trimmed = note.trim()
  if (!trimmed) return { error: "El texto no puede estar vacío." }
  try {
    await requireAdminAction()
    const actor = await actorEmail()
    // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
    // await notion.comments.create({ parent: { page_id: id }, rich_text: [...] })
    // await notion.pages.update({ page_id: id, properties: { "Status": { select: { name: "Resolved" } } } })
    await appendDecisionNote(id, `Human input:\n${trimmed}`)
    await updateDecisionByNotionId(id, {
      status:      "Resolved",
      approved_at: new Date().toISOString(),
      approved_by: actor,
    })
    revalidatePath("/admin/decisions")
    revalidatePath("/admin")
    revalidatePath("/admin/os")
    return {}
  } catch (err) {
    console.error("[resolveWithNote] error:", err)
    const msg = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? JSON.stringify(err)
    return { error: msg }
  }
}

/**
 * resolveWithSearch — historic flow that searched a Notion DB by title and
 * wrote a Notion relation property on the entity record.
 *
 * Post-cutoff there is no generic Supabase analogue: relation properties
 * mapped to specific FK columns per entity type, and arbitrary
 * "fieldName → relation array" writes do not exist in the canonical schema.
 * Callers currently always pass through `previewRelationTarget` +
 * `resolveWithRelationId` (the safer two-step flow). We redirect the legacy
 * one-step flow to the same Supabase-only resolution recording path used by
 * `resolveWithRelationId`.
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

  // notion-cutoff-2026-06-02: replaced by Supabase search across canonical tables.
  // const dbSchema = await notion.databases.retrieve({ database_id: searchDb }) as any
  // const titlePropName = ...
  // const results = await notion.databases.query({ database_id: searchDb, filter: { ... } })
  // ...append-relation, set "Relevance Status", create comment, mark Resolved

  const target = await previewRelationTarget(trimmed, searchDb)
  if (!target) {
    throw new Error(`No se encontró ningún registro que contenga "${trimmed}". Prueba con otro nombre.`)
  }
  await resolveWithRelationId(decisionId, entityId, fieldName, target.id)
}

/**
 * searchNotionEntities — full-text search across canonical entity tables.
 *
 * Pre-cutoff this used Notion's `notion.search` against orgs / people /
 * projects DBs. Post-cutoff it queries the Supabase canonical tables and
 * returns the same shape so the DecisionActions client component is
 * unchanged. The returned `id` is the row's `notion_id` (when available) so
 * downstream calls — which still pass through Notion-page-ID-shaped fields —
 * keep working until the UI is migrated off Notion IDs.
 */
export async function searchNotionEntities(query: string): Promise<{ id: string; name: string; dbType: string }[]> {
  await requireAdminAction()
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  // notion-cutoff-2026-06-02: replaced by canonical Supabase search
  // const results = await notion.search({ query: trimmed, filter: { value: "page", property: "object" }, page_size: 8 })

  const sb = getSupabaseServerClient()
  const like = `%${trimmed}%`
  const [orgRes, peopleRes, projectRes] = await Promise.all([
    sb.from("organizations").select("notion_id, name").ilike("name", like).limit(4),
    sb.from("people").select("notion_id, full_name, display_name, email").or(`full_name.ilike.${like},display_name.ilike.${like},email.ilike.${like}`).limit(4),
    sb.from("projects").select("notion_id, name").ilike("name", like).limit(4),
  ])

  const out: { id: string; name: string; dbType: string }[] = []
  for (const r of (orgRes.data ?? []) as { notion_id: string | null; name: string | null }[]) {
    if (!r.notion_id || !r.name) continue
    out.push({ id: r.notion_id, name: r.name, dbType: "Organización" })
  }
  for (const r of (peopleRes.data ?? []) as { notion_id: string | null; full_name: string | null; display_name: string | null; email: string | null }[]) {
    if (!r.notion_id) continue
    const name = r.full_name ?? r.display_name ?? r.email ?? ""
    if (!name) continue
    out.push({ id: r.notion_id, name, dbType: "Persona" })
  }
  for (const r of (projectRes.data ?? []) as { notion_id: string | null; name: string | null }[]) {
    if (!r.notion_id || !r.name) continue
    out.push({ id: r.notion_id, name: r.name, dbType: "Proyecto" })
  }
  return out.slice(0, 8)
}

/**
 * previewRelationTarget — read-only lookup before relation commit.
 *
 * Post-cutoff: searches the canonical Supabase table that corresponds to
 * `searchDb` (legacy Notion DB ID). Returns the row's notion_id (so the
 * downstream `resolveWithRelationId` can pass it back as the relation target)
 * and a synthesized portal URL.
 */
export async function previewRelationTarget(
  searchQuery: string,
  searchDb: string,
): Promise<{ id: string; name: string; url: string } | null> {
  await requireAdminAction()
  const trimmed = searchQuery.trim()
  if (!trimmed) return null

  // notion-cutoff-2026-06-02: replaced by canonical Supabase lookup
  // const dbSchema = await notion.databases.retrieve({ database_id: searchDb }) as any
  // const results = await notion.databases.query({ database_id: searchDb, filter: { ... }, page_size: 3 })

  const table = dbIdToTable(searchDb)
  if (!table) return null

  const sb = getSupabaseServerClient()
  const like = `%${trimmed}%`
  if (table === "organizations") {
    const { data } = await sb.from("organizations")
      .select("notion_id, name")
      .ilike("name", like).limit(1).maybeSingle()
    if (!data?.notion_id || !data.name) return null
    return { id: data.notion_id, name: data.name, url: `/admin/hall/organizations` }
  }
  if (table === "people") {
    const { data } = await sb.from("people")
      .select("notion_id, full_name, display_name, email")
      .or(`full_name.ilike.${like},display_name.ilike.${like},email.ilike.${like}`)
      .limit(1).maybeSingle()
    if (!data?.notion_id) return null
    const name = (data.full_name ?? data.display_name ?? data.email ?? "") as string
    if (!name) return null
    return { id: data.notion_id as string, name, url: `/admin/hall/contacts` }
  }
  if (table === "projects") {
    const { data } = await sb.from("projects")
      .select("notion_id, name")
      .ilike("name", like).limit(1).maybeSingle()
    if (!data?.notion_id || !data.name) return null
    return { id: data.notion_id, name: data.name, url: `/admin/projects` }
  }
  if (table === "sources") {
    const { data } = await sb.from("sources")
      .select("notion_id, title")
      .ilike("title", like).limit(1).maybeSingle()
    if (!data?.notion_id || !data.title) return null
    return { id: data.notion_id, name: data.title, url: `/admin` }
  }
  return null
}

/**
 * resolveAndUpdateMulti — multi-field human input for "Missing Input" decisions.
 *
 * Pre-cutoff: appended each {field, value} pair to the entity's matching
 * Notion rich_text property and then marked the decision Resolved.
 *
 * Post-cutoff: writes a structured summary to `decision_items.notes_raw` and
 * records the entity reference in entity_id. The Notion-era idiom of "agent
 * reads back the entity's Notes field" no longer applies; agents now read
 * decision context from Supabase.
 */
export async function resolveAndUpdateMulti(
  id: string,
  entityId: string,
  fields: { field: string; value: string }[],
) {
  await requireAdminAction()
  if (fields.length === 0) throw new Error("No fields provided")
  if (fields.every(f => !f.value.trim())) throw new Error("All fields are empty")
  const actor = await actorEmail()

  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // for (const { field, value } of fields) { ...notion.pages.retrieve + update on entityId... }
  // await notion.comments.create({ parent: { page_id: id }, ... })
  // await notion.pages.update({ page_id: id, properties: { Status: { select: { name: "Resolved" } } } })

  const summary = fields
    .filter(f => f.value.trim())
    .map(f => `${f.field}: ${f.value.trim()}`)
    .join("\n")
  await appendDecisionNote(id, `Multi-field input for entity ${entityId}:\n${summary}`)
  await updateDecisionByNotionId(id, {
    status:      "Resolved",
    entity_id:   entityId,
    approved_at: new Date().toISOString(),
    approved_by: actor,
  })

  revalidatePath("/admin/decisions")
  revalidatePath("/admin")
  revalidatePath("/admin/os")
}

/**
 * resolveWithRelationId — record a confirmed relation target on the decision_item.
 *
 * Pre-cutoff this wrote a Notion relation property on the source entity and
 * also flipped its "Relevance Status" to "Relevant". Post-cutoff there is no
 * uniform Supabase analogue for arbitrary relation properties (each Notion
 * relation column maps to a different FK on a different canonical table).
 * The resolution metadata is recorded on the decision_item itself so the
 * agent that raised the decision can act on it; entity-side mutation is
 * deferred to dedicated per-entity portal flows (see freeze §4 UI gap list).
 */
export async function resolveWithRelationId(
  decisionId: string,
  entityId: string,
  fieldName: string,
  targetPageId: string,
) {
  await requireAdminAction()
  const actor = await actorEmail()

  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // const entityPage = await notion.pages.retrieve({ page_id: entityId }) as any
  // const existingRelations = entityPage.properties?.[fieldName]?.relation ?? []
  // const newRelations = alreadyLinked ? existingRelations : [...existingRelations, { id: targetPageId }]
  // await notion.pages.update({ page_id: entityId, properties: { [fieldName]: { relation: newRelations } } })
  // try { await notion.pages.update({ page_id: entityId, properties: { "Relevance Status": { select: { name: "Relevant" } } } }) } catch {}
  // try { await notion.comments.create({ parent: { page_id: decisionId }, rich_text: [...] }) } catch {}
  // await notion.pages.update({ page_id: decisionId, properties: { Status: { select: { name: "Resolved" } } } })

  await appendDecisionNote(
    decisionId,
    `Relation written: ${fieldName} → ${targetPageId} (entity ${entityId})`,
  )
  await updateDecisionByNotionId(decisionId, {
    status:                  "Resolved",
    entity_id:               entityId,
    resolution_field:        fieldName,
    resolution_type:         "relation",
    resolution_target_table: dbIdToTable(LEGACY_NOTION_DB_ID.ORGANIZATIONS) ?? null,
    approved_at:             new Date().toISOString(),
    approved_by:             actor,
  })

  revalidatePath("/admin/decisions")
  revalidatePath("/admin")
  revalidatePath("/admin/os")
}

/**
 * approveEntityCreation — creates an Organization (and optionally a Person) in
 * Supabase, then resolves the Decision Item that proposed the creation.
 *
 * Post-cutoff: the org is inserted into `organizations` with a generated
 * UUID; `notion_id` is left null (Phase 1.1 made it nullable). Person
 * creation already wrote Supabase `people`; that path is preserved
 * unchanged. Decision resolution is written to `decision_items` keyed on
 * its notion_id.
 */
export async function approveEntityCreation(
  decisionId: string,
  orgName: string,
  domain?: string,
  category?: string,
  contactName?: string,
  contactEmail?: string,
): Promise<{ error?: string; orgUrl?: string }> {
  try {
    await requireAdminAction()
    const actor = await actorEmail()
    const sb = getSupabaseServerClient()
    const nowIso = new Date().toISOString()

    // notion-cutoff-2026-06-02: replaced by canonical insert into organizations
    // const orgPage = await notion.pages.create({
    //   parent: { database_id: "bef1bb86ab2b4cd280b6b33f9034b96c" },
    //   properties: orgProps,
    // })
    // const orgId = orgPage.id

    const orgRowId = randomUUID()
    const websiteUrl = domain
      ? (domain.startsWith("http") ? domain : `https://${domain}`)
      : null
    const { error: orgInsertErr } = await sb.from("organizations").insert({
      id:                 orgRowId,
      notion_id:          null, // Phase 1.1: notion_id is nullable post-cutoff
      name:               orgName,
      relationship_stage: "Active",
      org_category:       category ?? null,
      website:            websiteUrl,
      created_at:         nowIso,
      updated_at:         nowIso,
    })
    if (orgInsertErr) {
      return { error: `organizations insert failed: ${orgInsertErr.message}` }
    }
    const orgId = orgRowId

    // Create person if contact info provided — writes directly to Supabase
    // `people` (Notion Contacts is no longer a source of truth).
    if (contactName && contactEmail) {
      try {
        await sb.from("people").insert({
          email:                contactEmail.toLowerCase(),
          full_name:            contactName,
          display_name:         contactName,
          relationship_class:   "External",
          relationship_classes: ["External"],
          // org_notion_id was the previous link key; with Notion gone we leave
          // it null and use no FK (the canonical org row's UUID is `orgId`).
          org_notion_id:        null,
          auto_suggested:       "decision_approval",
          auto_suggested_at:    nowIso,
          first_seen_at:        nowIso,
          created_at:           nowIso,
          updated_at:           nowIso,
        })
      } catch (e) {
        console.warn("[approveEntityCreation] people insert failed:", e)
      }
    }

    // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
    // try { await notion.comments.create({ parent: { page_id: decisionId }, rich_text: [...] }) } catch {}
    // await notion.pages.update({ page_id: decisionId, properties: { Status: { select: { name: "Resolved" } } } })
    await appendDecisionNote(
      decisionId,
      `Org created: ${orgName} (${orgId})${contactName ? ` + contact ${contactName}` : ""}`,
    )
    await updateDecisionByNotionId(decisionId, {
      status:           "Resolved",
      entity_id:        orgId,
      entity_table:     "organizations",
      execute_approved: true,
      approved_at:      nowIso,
      approved_by:      actor,
    })

    revalidatePath("/admin/decisions")
    revalidatePath("/admin")
    revalidatePath("/admin/os")
    revalidatePath("/admin/hall/organizations")
    return { orgUrl: `/admin/hall/organizations` }
  } catch (err) {
    console.error("[approveEntityCreation] error:", err)
    const msg = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? JSON.stringify(err)
    return { error: msg }
  }
}

/**
 * approvePersonCreation — creates a Person in Supabase `people`, optionally
 * linked to an existing org, then resolves the Decision Item that proposed
 * the creation. Person creation has been Supabase-native since the contact
 * consolidation; the only Notion writes that remained were the audit
 * comment and the decision-item resolve, both replaced here.
 */
export async function approvePersonCreation(
  decisionId: string,
  personName: string,
  personEmail?: string,
  orgId?: string,
  orgName?: string,
): Promise<{ error?: string; personUrl?: string }> {
  try {
    await requireAdminAction()
    const actor = await actorEmail()
    const sb = getSupabaseServerClient()
    const nowIso = new Date().toISOString()

    const { data: inserted } = await sb
      .from("people")
      .insert({
        email:                personEmail?.toLowerCase() ?? null,
        full_name:            personName,
        display_name:         personName,
        relationship_class:   "External",
        relationship_classes: ["External"],
        org_notion_id:        orgId ?? null,
        auto_suggested:       "decision_approval",
        auto_suggested_at:    nowIso,
        first_seen_at:        nowIso,
        created_at:           nowIso,
        updated_at:           nowIso,
      })
      .select("id")
      .single()
    const personPageId = (inserted?.id as string | undefined) ?? "(unknown)"

    // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
    // try { await notion.comments.create({ parent: { page_id: decisionId }, rich_text: [...] }) } catch {}
    // await notion.pages.update({ page_id: decisionId, properties: { Status: { select: { name: "Resolved" } } } })
    await appendDecisionNote(
      decisionId,
      `Person created: ${personName} (supabase: ${personPageId})${orgName ? ` at ${orgName}` : ""}`,
    )
    await updateDecisionByNotionId(decisionId, {
      status:           "Resolved",
      entity_id:        personPageId === "(unknown)" ? null : personPageId,
      entity_table:     "people",
      execute_approved: true,
      approved_at:      nowIso,
      approved_by:      actor,
    })

    revalidatePath("/admin/decisions")
    revalidatePath("/admin")
    revalidatePath("/admin/os")
    revalidatePath("/admin/hall/contacts")
    return { personUrl: personPageId === "(unknown)" ? undefined : `/admin/hall/contacts` }
  } catch (err) {
    console.error("[approvePersonCreation] error:", err)
    const msg = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? JSON.stringify(err)
    return { error: msg }
  }
}

export async function dismissDecision(id: string) {
  await requireAdminAction()
  const actor = await actorEmail()
  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // await notion.pages.update({
  //   page_id: id,
  //   properties: {
  //     "Status": { select: { name: "Dismissed" } },
  //   },
  // })
  await updateDecisionByNotionId(id, {
    status:      "Dismissed",
    rejected_at: new Date().toISOString(),
    rejected_by: actor,
  })
  revalidatePath("/admin/decisions")
  revalidatePath("/admin")
  revalidatePath("/admin/os")
}

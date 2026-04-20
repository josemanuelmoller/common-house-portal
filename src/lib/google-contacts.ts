/**
 * google-contacts.ts
 *
 * Thin wrapper around the Google People API for Common House. Handles:
 *   - lookup by email across all sources (myContacts + otherContacts + directory)
 *   - label (contactGroup) discovery + idempotent creation
 *   - assigning / removing labels on a contact
 *
 * Used by hall_attendees sync:
 *   - Read path   — loadAttendeeClasses() resolves each attendee email via
 *                   lookupByEmails() and maps the contact's labels back to
 *                   relationship_class.
 *   - Write path  — POST /api/hall-contacts dual-writes the class into Google
 *                   Contacts via ensureLabelOnContact()/removeLabelFromContact().
 *
 * Label ↔ class mapping:
 *   LABEL_TO_CLASS maps Google Contacts label names (built-in + CH custom)
 *   to the relationship_class values the STB classifier expects. Everything
 *   that is work-context-specific carries a "CH " prefix so Jose can carry
 *   the same Google account to a future job without the labels going stale.
 *
 * Auth: reuses getGoogleAuthClient() from google-auth.ts — scope
 *       https://www.googleapis.com/auth/contacts must be on the grant.
 */

import { google, people_v1 } from "googleapis";
import { getGoogleAuthClient } from "./google-auth";

// ─── Label ↔ class mapping ───────────────────────────────────────────────────

/** Google Contacts built-in or CH-custom labels we recognise. */
export const LABEL_TO_CLASS: Readonly<Record<string, string>> = {
  // Built-in system labels — plain names, no prefix
  "Family":            "Family",
  "Friends":           "Friend",
  // Custom — generic enough to carry across workplaces
  "Personal Service":  "Personal Service",
  "VIP":               "VIP",
  "Investor":          "Investor",
  "Funder":            "Funder",
  "Client":            "Client",
  "Partner":           "Partner",
  "Vendor":            "Vendor",
  "External":          "External",
  // Custom — workplace-scoped, prefix "CH " so Jose can create
  // a different "XYZ Team" / "XYZ Portfolio" at a future company
  // without overwriting these.
  "CH Team":           "Team",
  "CH Portfolio":      "Portfolio",
} as const;

export const CLASS_TO_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LABEL_TO_CLASS).map(([label, cls]) => [cls, label]),
);

// ─── Client ──────────────────────────────────────────────────────────────────

function getPeopleClient(): people_v1.People | null {
  const auth = getGoogleAuthClient();
  if (!auth.ok) return null;
  return google.people({ version: "v1", auth: auth.client });
}

// ─── Contact lookup ──────────────────────────────────────────────────────────

export type ResolvedContact = {
  email:          string;
  resourceName:   string | null;     // "people/c1234" — null if not in Contacts
  displayName:    string | null;
  labels:         string[];          // all contactGroup names on this contact
  classes:        string[];          // every LABEL_TO_CLASS hit (multi-tag)
  source:         "myContacts" | "otherContacts" | "directory" | "not_found";
};

/**
 * Resolve a batch of emails against the authenticated user's Google Contacts.
 *
 * Strategy:
 *   1) people.searchContacts — fast typeahead, myContacts + otherContacts
 *   2) For each resourceName returned, fetch labels via people.get
 *   3) Deduplicate by email; keep the first (myContacts wins over otherContacts)
 *
 * Fails open — emails not found return a stub with source="not_found" and
 * class=null so the classifier treats them as unknown (never auto-hides prep).
 */
export async function lookupByEmails(emails: string[]): Promise<Map<string, ResolvedContact>> {
  const out = new Map<string, ResolvedContact>();
  const unique = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return out;

  const people = getPeopleClient();
  if (!people) {
    // No Google auth — every email resolves as not_found (system fails open)
    for (const e of unique) {
      out.set(e, { email: e, resourceName: null, displayName: null, labels: [], classes: [], source: "not_found" });
    }
    return out;
  }

  // Preload all contact groups (labels) to resolve resourceName → formattedName.
  const groups = await listContactGroups(people);
  const groupNameById = new Map<string, string>();
  for (const g of groups) {
    if (g.resourceName && g.formattedName) groupNameById.set(g.resourceName, g.formattedName);
  }

  // Walk each email. searchContacts supports 1 query per call. Small N (20-40)
  // keeps this bounded; cache layer above prevents per-render calls anyway.
  for (const email of unique) {
    const contact = await findContactForEmail(people, email, groupNameById);
    out.set(email, contact);
  }

  return out;
}

async function findContactForEmail(
  people: people_v1.People,
  email: string,
  groupNameById: Map<string, string>,
): Promise<ResolvedContact> {
  const stub: ResolvedContact = {
    email, resourceName: null, displayName: null, labels: [], classes: [], source: "not_found",
  };

  // Try myContacts first (user-saved)
  try {
    const res = await people.people.searchContacts({
      query:     email,
      pageSize:  10,
      readMask:  "names,emailAddresses,memberships",
    });
    const hit = findByEmail(res.data.results ?? [], email);
    if (hit) return formatContact(hit, email, "myContacts", groupNameById);
  } catch { /* fall through */ }

  // Then otherContacts (auto-saved from Gmail interactions)
  try {
    const res = await people.otherContacts.search({
      query:     email,
      pageSize:  10,
      readMask:  "names,emailAddresses",
    });
    const hit = findByEmail(res.data.results ?? [], email);
    if (hit) return formatContact(hit, email, "otherContacts", groupNameById);
  } catch { /* fall through */ }

  return stub;
}

function findByEmail(
  results: people_v1.Schema$SearchResult[],
  email: string,
): people_v1.Schema$Person | null {
  const target = email.toLowerCase();
  for (const r of results) {
    const p = r.person;
    if (!p) continue;
    const emails = (p.emailAddresses ?? []).map(e => (e.value ?? "").toLowerCase());
    if (emails.includes(target)) return p;
  }
  return null;
}

function formatContact(
  p: people_v1.Schema$Person,
  email: string,
  source: ResolvedContact["source"],
  groupNameById: Map<string, string>,
): ResolvedContact {
  const resourceName = p.resourceName ?? null;
  const displayName  = p.names?.[0]?.displayName ?? null;
  const labels: string[] = [];
  for (const m of p.memberships ?? []) {
    const gid = m.contactGroupMembership?.contactGroupResourceName;
    if (!gid) continue;
    const name = groupNameById.get(gid);
    if (name) labels.push(name);
  }
  // Multi-tag: emit every LABEL_TO_CLASS hit, deduplicated and in the
  // deterministic LABEL_TO_CLASS insertion order (Family/Friends/Personal
  // before workplace labels).
  const classes: string[] = [];
  for (const label of Object.keys(LABEL_TO_CLASS)) {
    if (labels.includes(label)) classes.push(LABEL_TO_CLASS[label]);
  }
  return { email, resourceName, displayName, labels, classes, source };
}

// ─── Contact group (label) management ────────────────────────────────────────

async function listContactGroups(people: people_v1.People): Promise<people_v1.Schema$ContactGroup[]> {
  const res = await people.contactGroups.list({ pageSize: 200 });
  return res.data.contactGroups ?? [];
}

/**
 * Idempotent: returns the resourceName of the contact group matching `label`.
 * If it doesn't exist, creates it. Built-in groups (Family, Friends, etc.)
 * always exist so we only actually create the custom CH ones.
 */
export async function ensureContactGroup(label: string): Promise<string | null> {
  const people = getPeopleClient();
  if (!people) return null;
  const groups = await listContactGroups(people);
  const existing = groups.find(g => g.formattedName === label || g.name === label);
  if (existing?.resourceName) return existing.resourceName;
  try {
    const res = await people.contactGroups.create({
      requestBody: { contactGroup: { name: label } },
    });
    return res.data.resourceName ?? null;
  } catch {
    return null;
  }
}

/** True for resources Google treats as read-only for labels (otherContacts). */
function isReadOnlyResource(resourceName: string): boolean {
  return resourceName.startsWith("otherContacts/");
}

/**
 * Create a new contact in Google Contacts (myContacts bucket) so Jose can
 * assign labels to it. Returns the new resourceName or null on failure.
 * Called when the user tags an attendee that People API could not find.
 */
export async function createContactFromEmail(
  email: string,
  displayName: string | null,
): Promise<{ ok: true; resourceName: string } | { ok: false; reason: string }> {
  try {
    const people = getPeopleClient();
    if (!people) return { ok: false, reason: "no_google_auth" };
    const namePart = (displayName ?? email.split("@")[0]).slice(0, 100);
    const res = await people.people.createContact({
      requestBody: {
        names:          [{ displayName: namePart }],
        emailAddresses: [{ value: email }],
      },
    });
    if (!res.data.resourceName) return { ok: false, reason: "no_resource_name_returned" };
    return { ok: true, resourceName: res.data.resourceName };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Promote a Google 'otherContact' (auto-saved from Gmail / Calendar invites)
 * into the main address book so labels can be applied. Uses the native
 * copyOtherContactToMyContactsGroup op, which preserves name + email and
 * returns the new people/c… resourceName.
 */
export async function promoteOtherContact(
  otherContactResourceName: string,
): Promise<{ ok: true; resourceName: string } | { ok: false; reason: string }> {
  try {
    if (!otherContactResourceName.startsWith("otherContacts/")) {
      return { ok: false, reason: "not_an_other_contact" };
    }
    const people = getPeopleClient();
    if (!people) return { ok: false, reason: "no_google_auth" };
    const res = await people.otherContacts.copyOtherContactToMyContactsGroup({
      resourceName: otherContactResourceName,
      requestBody:  { copyMask: "names,emailAddresses,phoneNumbers" },
    });
    if (!res.data.resourceName) return { ok: false, reason: "no_resource_name_returned" };
    return { ok: true, resourceName: res.data.resourceName };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Multi-tag write: assigns EVERY provided label and removes any known
 * (LABEL_TO_CLASS) label not in the target set. Preserves unrelated
 * memberships (e.g. Jose's "Algramo" group).
 */
export async function setContactLabels(
  resourceName: string,
  labels: string[],
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (isReadOnlyResource(resourceName)) {
      return { ok: false, reason: "read_only_other_contact" };
    }
    const people = getPeopleClient();
    if (!people) return { ok: false, reason: "no_google_auth" };

    // Ensure all target groups exist (create missing custom ones idempotently).
    const targetGroupIds: string[] = [];
    for (const label of labels) {
      const gid = await ensureContactGroup(label);
      if (gid) targetGroupIds.push(gid);
    }

    const person = await people.people.get({
      resourceName,
      personFields: "memberships",
    });
    const current = person.data.memberships ?? [];
    const knownLabels = Object.keys(LABEL_TO_CLASS);
    const groups = await listContactGroups(people);
    const knownGroupIds = new Set(
      groups.filter(g => g.formattedName && knownLabels.includes(g.formattedName)).map(g => g.resourceName!),
    );

    // Preserve non-known memberships; replace known-group memberships with the
    // exact target set.
    const preserved = current.filter(m => {
      const gid = m.contactGroupMembership?.contactGroupResourceName;
      return gid && !knownGroupIds.has(gid);
    });
    const desired: people_v1.Schema$Membership[] = [
      ...preserved,
      ...targetGroupIds.map(id => ({ contactGroupMembership: { contactGroupResourceName: id } })),
    ];

    await people.people.updateContact({
      resourceName,
      updatePersonFields: "memberships",
      requestBody: {
        resourceName,
        etag: person.data.etag,
        memberships: desired,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Add `label` to the given contact and (optionally) remove other CH/system
 * labels that conflict. We treat relationship_class as single-value for the
 * classifier — if Jose tags an email as "Family" we remove "Investor" et al.
 *
 * Returns `ok:false, reason:"read_only_other_contact"` for otherContacts,
 * which the People API does not allow mutating. The caller should promote
 * the contact in Google Contacts ("Save contact") for the write path to work.
 */
export async function setContactLabel(
  resourceName: string,
  label: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (isReadOnlyResource(resourceName)) {
      return { ok: false, reason: "read_only_other_contact" };
    }
    const people = getPeopleClient();
    if (!people) return { ok: false, reason: "no_google_auth" };

    const targetGroupId = await ensureContactGroup(label);
    if (!targetGroupId) return { ok: false, reason: "group_create_failed" };

    // Fetch current memberships so we can preserve non-CH labels and remove
    // conflicting CH/relationship ones.
    const person = await people.people.get({
      resourceName,
      personFields: "memberships",
    });
    const currentMemberships = person.data.memberships ?? [];
    const knownLabels = Object.keys(LABEL_TO_CLASS);

    const groups = await listContactGroups(people);
    const knownGroupIds = new Set(
      groups.filter(g => g.formattedName && knownLabels.includes(g.formattedName)).map(g => g.resourceName!),
    );

    const preserved = currentMemberships.filter(m => {
      const gid = m.contactGroupMembership?.contactGroupResourceName;
      return gid && !knownGroupIds.has(gid);
    });

    const desired: people_v1.Schema$Membership[] = [
      ...preserved,
      { contactGroupMembership: { contactGroupResourceName: targetGroupId } },
    ];

    await people.people.updateContact({
      resourceName,
      updatePersonFields: "memberships",
      requestBody: {
        resourceName,
        etag: person.data.etag,
        memberships: desired,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove all known (mapped) labels from a contact — class goes back to null. */
export async function clearContactLabels(resourceName: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (isReadOnlyResource(resourceName)) {
      return { ok: false, reason: "read_only_other_contact" };
    }
    const people = getPeopleClient();
    if (!people) return { ok: false, reason: "no_google_auth" };

    const person = await people.people.get({
      resourceName,
      personFields: "memberships",
    });
    const current = person.data.memberships ?? [];
    const knownLabels = Object.keys(LABEL_TO_CLASS);
    const groups = await listContactGroups(people);
    const knownGroupIds = new Set(
      groups.filter(g => g.formattedName && knownLabels.includes(g.formattedName)).map(g => g.resourceName!),
    );
    const preserved = current.filter(m => {
      const gid = m.contactGroupMembership?.contactGroupResourceName;
      return gid && !knownGroupIds.has(gid);
    });
    await people.people.updateContact({
      resourceName,
      updatePersonFields: "memberships",
      requestBody: {
        resourceName,
        etag: person.data.etag,
        memberships: preserved,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

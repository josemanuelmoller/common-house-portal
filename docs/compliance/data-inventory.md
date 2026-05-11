# Data inventory (PII map)

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

What personal data CH stores, where, why, how long, and how to delete.
This is the document GDPR Art. 30 requires and what a customer DPA
references.

## Categories

| Category | Examples | Lawful basis (GDPR) |
|---|---|---|
| Contact data | Name, email, phone | Contract / legitimate interest |
| Professional data | Title, organisation, LinkedIn URL | Legitimate interest |
| Engagement data | Notes from meetings, project context, deal stage | Contract |
| System data | Login timestamps, IP (transient), MFA factor type | Legitimate interest (security) |

CH does NOT store: bank account numbers, social security numbers,
passport numbers, health data, biometric data, children's data.

## Tables (Supabase `commonhouse` project)

| Table | PII fields | Retention | Delete procedure |
|---|---|---|---|
| `auth.users` (Clerk) | email, name, phone | Until user requests deletion | Clerk dashboard → user → Delete |
| `organizations` | contact_name, contact_email, notes | Indefinite (relationship history) | `DELETE FROM organizations WHERE id = :id` |
| `people` | name, email, phone, role | Indefinite | `DELETE FROM people WHERE id = :id` |
| `opportunities` | counterparty fields | Indefinite | `DELETE FROM opportunities WHERE id = :id` |
| `evidence` | references PII via source IDs | Indefinite | Cascade from sources |
| `sources` | from_address, to_addresses (email source) | Indefinite | `DELETE FROM sources WHERE id = :id` |
| `living_room_people` | name, email, role | Indefinite | `DELETE FROM living_room_people WHERE id = :id` |
| `chief_of_staff_tasks` | task text may reference people | Indefinite | `DELETE FROM chief_of_staff_tasks WHERE id = :id` |

## Storage buckets

| Bucket | Content | PII risk | Retention | Delete |
|---|---|---|---|---|
| `library-docs` | Uploaded reference documents | Possible | Indefinite | Bucket UI or `DELETE FROM storage.objects` |
| `garage-docs` | Startup data-room documents | High (commercially sensitive) | Indefinite | Bucket UI |
| `meeting-recordings` | Audio (only opted-in) | High | 90 days (planned) | Automated purge cron (not yet built) |

## Third-party data egress

| Vendor | What | When |
|---|---|---|
| Anthropic | Agent prompts | Whenever an agent runs against PII-bearing context |
| Fireflies | Audio of meetings | Only meetings explicitly enabled |
| Google Drive | Generated artifacts (proposals, decks) | When `save-artifact-to-drive` skill runs |

## Subject access / deletion requests

Process if a data subject requests their data:
1. Confirm identity (match request email to records).
2. Run inventory query against the tables above filtered by email.
3. Export as JSON within 30 days.
4. On deletion request, execute the delete procedures above and confirm
   to data subject within 30 days.
5. Log the request in this folder (`docs/compliance/dsar-log/`).

Today no DSARs received. Procedure documented for completeness.

## Honest gaps

- No automated retention policy enforcement (everything is indefinite).
  Should add: 7-year retention max on engagement data, 2-year on system
  logs.
- No data residency guarantee — Supabase US-East. Document for EU
  customers.

## Next review

2026-08-11.

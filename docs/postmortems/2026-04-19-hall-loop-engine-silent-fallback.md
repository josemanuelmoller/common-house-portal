# Postmortem: Hall Loop Engine Silent Fallback

**Date:** 2026-04-19  
**Severity:** Silent data regression  
**Surface:** Hall Chief-of-Staff Desk

## What users were seeing

The Hall Chief-of-Staff Tasks section was rendering a reduced Notion fallback set instead of the live Supabase loop-engine task set. As a result, the desk showed a smaller and lower-fidelity task list than expected.

At the same time:
- Opportunities such as Horizon Europe and Pew appeared twice, once in CoS Tasks and again in Opportunities Explorer.
- Discard and done actions did not persist reliably across hard reloads while the fallback path was active.
- The UI looked functional. Nothing visibly crashed, and there was no obvious sign that Hall was reading from the wrong source.

## True root cause

This was caused by two infrastructure misconfigurations acting together.

### 1. Wrong Vercel project serving the production domain

`portal.wearecommonhouse.com` was being served by the **`legacy-common-house-app`** Vercel project, not `common-house-portal`.

That meant:
- deploys sent from the working directory were going to the wrong Vercel project
- environment variable changes were being applied to the wrong project
- production kept serving old behaviour even when deployment and env checks appeared correct in the CLI

### 2. Wrong Supabase configuration in the real production project

The real production project had two problems:
- it had no `SUPABASE_URL` env var at all, even though the current server code expects it
- its Supabase variables pointed to the legacy `cote_OS` project instead of `commonhouse`

In practice:
- `getSupabaseServerClient()` threw when `SUPABASE_URL` was missing
- `getCoSTasksFromLoops()` caught that failure and returned `null`
- `getCoSTasks()` silently fell back to Notion
- even when the API route connected successfully, it was connecting to the wrong Supabase project, where the loops query returned an empty but valid result set for `open` and `in_progress`

No user-visible error surfaced.

## Why earlier debugging signals were misleading

Several signals looked healthy while production was still wrong.

- `/api/cos-loops` returned `{"ok":true,"loops":[]}`. That looked like a healthy connection to an empty table, but it was actually a valid query against the wrong Supabase project.
- `tsc --noEmit` passed. The bug was not in TypeScript or application logic.
- The Notion fallback was silent by design. Hall still rendered plausible data, so the product looked degraded but not broken.
- The Vercel CLI was linked to `common-house-portal`, which made env inspection and deploy output look correct while production traffic was hitting `legacy-common-house-app`.

## Exact fixes applied

### Infrastructure

- Added `SUPABASE_URL` to the real production Vercel project: `legacy-common-house-app`
- Updated `SUPABASE_ANON_KEY` to point to the `commonhouse` Supabase project
- Updated `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the same project for consistency
- Re-deployed the current codebase to the actual production Vercel project serving `portal.wearecommonhouse.com`

### Code

- Added `linkedEntityId?: string` to the `CoSTask` type
- Populated `linkedEntityId` from `loop.linked_entity_id` for loop-engine opportunity tasks
- Fixed Opportunities Explorer dedup to use `linkedEntityId ?? id`, so opportunity loops dedupe against their underlying entity instead of their loop UUID
- Removed the temporary debug endpoint used during diagnosis

## Production verification

Verified on `https://portal.wearecommonhouse.com` after redeploy.

- `/api/cos-loops` returned live open loops from `commonhouse`
- Hall switched from the reduced Notion fallback set to the live loop-engine task set
- CoS task counts increased to reflect the actual open loop inventory
- Discard and done actions persisted after hard reload on loop-engine tasks
- Opportunity duplication disappeared after the dedup fix

## Permanent verification checklist

These checks should become mandatory for deploys that affect production data sources.

### Deployment target

- Confirm which Vercel project is assigned to the production domain
- Confirm the deploy target matches that project before deploying
- Verify behaviour on the production domain, not only in the CLI-linked project

### Environment variables

- After any env var change, verify the value from the production runtime, not just from CLI project metadata
- When piping secrets into `vercel env add`, use `printf "%s"` rather than `echo` to avoid trailing newlines
- Confirm required server-side variables exist under the exact names the runtime code reads

### Data-path verification

- After any Supabase-related deploy, call the relevant production API route directly
- Treat `200 OK` with empty data as a failure condition until the expected record set is confirmed
- If a fallback path exists, verify whether production is using the primary path or the fallback path

### Observability

- Any fallback path that swaps from a primary data source to a secondary one should emit a visible warning in runtime logs
- Hall should expose a visible source indicator for critical sections, for example `Source: loop-engine` or `Source: notion-fallback`

## Product risks masked by the fallback

The Notion fallback kept Hall looking operational, but it masked several real product risks.

- **Lower-fidelity prioritisation.** The loop engine uses structured scoring, deduplication, and signal gating. The Notion fallback surfaces a thinner and noisier approximation.
- **Broken task persistence.** While fallback tasks were active, done and discard behaviour could look successful in-session without being backed by the intended loop-engine state model.
- **Duplicate task surfaces.** Loop UUIDs and opportunity entity IDs are different identifiers. Without explicit entity-aware dedup, the same underlying item can appear in multiple sections.
- **Silent degradation.** Because the fallback rendered plausible data, the product could remain in a degraded state across multiple deploys without anyone noticing.

## What should change permanently

A visible source indicator in the Hall header, plus a warning in runtime logs whenever fallback activates, should become mandatory. Without that, the system can degrade silently again while still looking operational.

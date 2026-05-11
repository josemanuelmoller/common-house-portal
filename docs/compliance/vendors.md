# Vendor inventory (sub-processors)

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

Every third party that touches Common House data or runs production
infrastructure. This is the list that goes into a customer DPA verbatim.

| Vendor | Service | Data touched | Location | SOC 2 | DPA on file |
|---|---|---|---|---|---|
| **Vercel, Inc.** | Frontend hosting + cron | All request/response payloads transiting `portal.wearecommonhouse.com` | US (global edge) | Type II (public) | Vercel standard ToS |
| **Supabase, Inc.** | Postgres DB + Storage + Auth platform | All persistent application data (PII: emails, names, project content) | US (East-1 region) | Type II (public) | Supabase DPA (web-signed) |
| **Clerk, Inc.** | Authentication / session management | Email addresses, login events, MFA factors | US | Type II (public) | Clerk standard ToS |
| **Anthropic PBC** | LLM API (Claude) | Prompts + completions for agent runs (can include PII from user input) | US | Type II (public, 2024) | Anthropic Commercial Terms |
| **GitHub (Microsoft)** | Source code + CI | All non-secret source code, CI logs | US | Type II (public) | GitHub Customer Agreement |
| **Google LLC (Workspace)** | Founder email + Drive (artifact storage) | Founder email, OAuth-fetched user emails for Gmail integration | US/Global | Type II (public) | Google Workspace DPA |
| **Notion Labs** | Legacy data store (read-only until 2026-06-02 cutoff) | Project content, client notes | US | Type II (public) | Notion ToS |
| **Cloudflare, Inc.** | DNS + CDN + WAF (free tier) | All request metadata (IP, UA, path) | Global edge | Type II (public) | Cloudflare standard ToS |
| **Fireflies.ai** | Meeting transcription (only when explicitly invoked) | Audio recordings of opted-in meetings, transcripts | US | Type II (public) | Fireflies DPA |
| **PWPush / signed URLs** | Internal — no third party | — | — | — | — |

## Data flow

- All user-facing PII enters via Clerk (auth) or via Notion/Supabase data
  the founder enters manually. No third-party tracking pixels, no
  analytics SDKs, no Google Analytics.
- Anthropic receives only what is sent in agent runs — prompts include
  text the founder has authored or pulled from CH's own databases.
- Fireflies receives only meetings the founder explicitly enables it on.

## Removal procedure

If a customer requests that their data not be processed by a particular
vendor:
1. Document the request in writing.
2. Identify which CH data store contains their data (typically Supabase).
3. Mark records with `data_processing_restrictions = {"exclude": ["vendor"]}`.
4. Audit code paths that send to that vendor to skip restricted records.

Today this is N/A — no customer has invoked GDPR Art. 18 or equivalent.
Procedure documented for completeness.

## Next review

2026-08-11.

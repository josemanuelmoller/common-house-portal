---
name: query-reuse-landscape
description: Look up reuse-economy organizations and solutions in the public.reuse_landscape Supabase table (1.4K+ rows from the PR3/EMF reuse atlas). Use this whenever a project, proposal, knowledge asset, or opportunity needs market evidence — competitors in a category, operators in a geography, partners with a specific reuse model. Read-only. Does NOT create entities, modify the table, or push rows into organizations.
---

You are the Reuse Atlas query interface for Common House OS v2.

## What this skill does
Returns matching rows from `public.reuse_landscape` for a given research question. Two output modes:
- **list** — table of matching rows with key fields (default)
- **summary** — narrative roll-up by category, region, or stage (when the caller is looking for landscape framing, not specific names)

## What this skill does NOT do
- Modify any row in `reuse_landscape`
- Create rows in `organizations` (that's the `/api/admin/landscape/promote` route — Jose-gated)
- Speculate beyond what's in the table — if a row's field is null, report it null, do not infer
- Mix this dataset with the canonical `organizations` table in the same result (they are intentionally separate; landscape = market intel, organizations = CH relationship layer)

---

## Input shape

The caller specifies any subset of:
- `category` — e.g. "Reusable Cup & Container Programs"
- `sub_category` — e.g. "Reusable Cup Program"
- `region` — one of: Africa, Asia, Europe, Middle East, North America, Oceana, South America, Global
- `country` — e.g. "United Kingdom", "Spain"
- `stage` — one of: "1-Concept", "2-Pilot/Start-up", "3-Growth Stage", "4-Established"
- `status` — "Active" or "Inactive"
- `waste_type` — one of: Sachets, Small Plastics, Rigid Plastics, Cardboard/Wood, Disposable Foodware
- `material` — free-text contains, matched against `materials[]`
- `channel` — Restaurants/Cafes, Cities, Events, Corporate, Festivals, Stadiums, Package-Free Shop - Food & Bev, Package-Free Shop - Home & Personal Care, Local Delivery, Delivery by Mail
- `search` — free-text ILIKE over solution_name + organization_name + description
- `limit` — default 25, max 200
- `mode` — "list" (default) or "summary"

At least one filter must be present. Reject queries that would return all 1468 rows.

---

## Data shape

Available columns in `reuse_landscape`:

```
id, solution_name, organization_name, website, description, mission,
solution_category, sub_category, waste_types[], emf_quadrant,
reusable_item_material, materials[], reusable_item_belongs_to,
fee_type, incentive_program, subscription_type, wash_party,
return_rate, second_use_rate,
channels[], small_store_compatible, low_income_accessible, informal_sector_compatible,
for_profit, for_profit_advocacy, advocacy_nature, stage,
year_founded, year_started, year_status_note,
headquarters, hq_country, active_regions[], active_countries[], languages[],
budget_2020_usd, org_budget_2020_usd, employees_band, funding_received,
impact_description, tons_plastic_avoided_2020, ghg_avoided_2020,
users_2020, products_circulated_2020,
key_leadership, status, end_date, year_ended,
seeking_funding, seeking_advisors, actively_hiring, partner_orgs,
data_validated_by_org, data_last_updated,
organization_id (FK → organizations.id), ch_relevance_score, ch_tags[]
```

`organization_id` is non-null when the row has been promoted into the CH network. Surface this in results: prefix promoted rows with **[IN NETWORK]**.

---

## Query patterns

### list mode — single category in a region
```sql
SELECT solution_name, organization_name, hq_country, stage, status, website
FROM public.reuse_landscape
WHERE solution_category = $1
  AND $2 = ANY(active_regions)
  AND status = 'Active'
ORDER BY year_founded DESC NULLS LAST
LIMIT $3;
```

### list mode — channel + country
```sql
SELECT solution_name, organization_name, sub_category, stage, fee_type, employees_band
FROM public.reuse_landscape
WHERE $1 = ANY(channels)
  AND hq_country = $2
ORDER BY organization_name
LIMIT $3;
```

### list mode — free-text
```sql
SELECT solution_name, organization_name, solution_category, hq_country, website
FROM public.reuse_landscape
WHERE to_tsvector('simple', coalesce(solution_name,'') || ' ' || coalesce(organization_name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(mission,''))
      @@ plainto_tsquery('simple', $1)
LIMIT $2;
```

### summary mode — by region
```sql
SELECT
  unnest(active_regions) AS region,
  count(*) AS n,
  count(*) FILTER (WHERE status = 'Active') AS active,
  count(DISTINCT solution_category) AS categories
FROM public.reuse_landscape
WHERE solution_category = $1
GROUP BY region
ORDER BY n DESC;
```

---

## Output format

### list mode
```
REUSE ATLAS — <filter summary>
Found <n> matching rows. Showing top <limit>.

  1. <solution_name> · <organization_name>
     <category> / <sub_category> · <stage> · <hq_country>
     <description first 120 chars>
     status: <status> · founded <year> · employees <employees_band>
     website: <website>
     [IN NETWORK]  ← only if organization_id IS NOT NULL

  2. ...
```

### summary mode
```
REUSE ATLAS — <filter summary>
Total matching: <n>

By <dimension>:
  <key>: <count> rows (<active> active) · <pct>%
  ...

Top stages: <stage>: <n> · <stage>: <n> · ...
```

---

## Boundaries

- Always include row count and the filter applied. Never claim "the global landscape" — claim "the landscape per this dataset, last updated <data_last_updated max>".
- When a query returns zero rows, say so explicitly and suggest 1-2 relaxations of the filter.
- Never fabricate an entry not in the table.
- Do not export to a file unless the caller passes a `write_to=<path>` argument.
- If the caller hints at intent ("for the Co-op proposal", "for our knowledge node on refill-otg"), name that intent in the output header — it helps downstream agents (project-operator, knowledge-curator) route the result correctly.

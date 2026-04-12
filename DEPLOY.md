# Deploy — portal.wearecommonhouse.com

## Pre-requisites
- [ ] Vercel account (vercel.com)
- [ ] GitHub repo connected (ya confirmado)
- [ ] Clerk production keys (pk_live_* / sk_live_*)
- [ ] DNS access para wearecommonhouse.com

---

## Paso 1 — Deploy en Vercel

```bash
# Opción A: via Vercel CLI (desde la carpeta del proyecto)
cd "C:\Users\josem\OneDrive\Escritorio\common-house-app"
npx vercel --prod

# Opción B: via dashboard
# 1. vercel.com → New Project → Import Git Repository
# 2. Seleccionar el repo common-house-app
# 3. Framework: Next.js (auto-detectado)
# 4. Agregar env vars (ver Paso 2) → Deploy
```

## Paso 2 — Env vars en Vercel Dashboard

Settings → Environment Variables → agregar cada una:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_***` |
| `CLERK_SECRET_KEY` | `sk_live_***` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `AFTER_SIGN_IN_URL` | `/hall` |
| `NOTION_API_KEY` | `secret_***` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | (base64 del JSON) |
| `NEXT_PUBLIC_APP_URL` | `https://portal.wearecommonhouse.com` |

## Paso 3 — Dominio personalizado

1. Vercel Dashboard → tu proyecto → Settings → Domains
2. Agregar: `portal.wearecommonhouse.com`
3. Vercel te da un CNAME:
   ```
   CNAME  portal  cname.vercel-dns.com
   ```
4. En tu DNS provider, agregar ese registro CNAME
5. Esperar propagación (2-10 min con Cloudflare, hasta 48h con otros)

## Paso 4 — Clerk allowlist / production

1. dashboard.clerk.com → tu app → User & Authentication → Allowlist
2. Agregar emails de los primeros clientes
3. O activar open sign-up si prefieres

## Paso 5 — Smoke test

```bash
# Rutas a verificar después del deploy:
https://portal.wearecommonhouse.com/hall           # Cliente: Hall
https://portal.wearecommonhouse.com/living-room    # Community: Living Room
https://portal.wearecommonhouse.com/admin          # Admin: House View
https://portal.wearecommonhouse.com/admin/decisions # Admin: Decision Center
https://portal.wearecommonhouse.com/admin/living-room # Admin: Curation
https://portal.wearecommonhouse.com/residents      # Admin: Residents
```

---

## Rutas del portal (estado actual)

| Ruta | Tipo | Estado | Datos |
|---|---|---|---|
| `/hall` | Cliente | ✅ Live | Notion: Project, Evidence, Sources |
| `/garage` | Cliente | ✅ Live | Notion: Project, Evidence, Sources |
| `/workroom` | Cliente | ✅ Live (stub) | — |
| `/dashboard` | Cliente | ✅ Live | Notion: Stats |
| `/living-room` | Todos | ✅ **Nuevo** | Notion: People, Projects, Knowledge, Briefs |
| `/admin` | Admin | ✅ Live | Notion: Projects, Sources, Evidence |
| `/admin/os` | Admin | ✅ Live | Notion: Evidence, Sources |
| `/admin/knowledge` | Admin | ✅ Live | Notion: Knowledge Assets |
| `/admin/decisions` | Admin | ✅ **Nuevo** | Notion: Decision Items |
| `/admin/living-room` | Admin | ✅ **Nuevo** | Notion: People, Projects, Briefs, Assets |
| `/admin/health` | Admin | ⚠ Stub | — |
| `/residents` | Admin | ✅ Live | Notion: People |
| `/library` | Admin | ✅ Live | Notion: Knowledge Assets |

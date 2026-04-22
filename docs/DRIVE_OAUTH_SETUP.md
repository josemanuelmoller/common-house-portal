# Drive OAuth setup — setup guide for José

**Objetivo**: que `plan-master-agent` pueda subir v{N+1} de cada artifact al mismo folder de Drive donde vive v1, autenticado como tú (no como service account).

**Tiempo total**: ~10 minutos. Lo haces una sola vez, después queda funcionando.

---

## Lo que ya hice yo

- Código listo: helper `uploadTextToDriveFolder` en `src/lib/drive.ts`
- Endpoint `/regenerate` ya intenta el upload; si las env vars faltan, cae con gracia ("Drive sync pending")
- Script turnkey `tools/get-drive-refresh-token.mjs` que reusa el OAuth client de Gmail que ya tienes configurado
- Este doc

---

## Lo que necesito que hagas tú (único paso interactivo)

### 1 — Habilitar Drive API + autorizar redirect URI (2 min, Google Cloud Console)

Ve a [Google Cloud Console](https://console.cloud.google.com) en el proyecto que contiene tu OAuth client de Gmail.

**a)** `APIs & Services → Library` → busca "Google Drive API" → **Enable**.

**b)** `APIs & Services → Credentials` → click en el OAuth 2.0 Client ID que usas para Gmail.

En **Authorized redirect URIs**, añade:

```
http://localhost:53682/oauth2-callback
```

Guardar. (Si ya tienes otros redirect URIs, déjalos — solo agregás uno nuevo.)

### 2 — Correr el script (3 min, terminal)

Desde la carpeta del proyecto:

```bash
node tools/get-drive-refresh-token.mjs
```

El script:
- Lee `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET` de `.env.local`
- Abre tu browser default en la URL de Google OAuth
- Arranca un mini-servidor en `localhost:53682` para recibir el callback
- Cuando autorices en el browser, te redirige a `localhost:53682` con el código
- El script intercambia el código por un refresh token y te lo imprime en la terminal
- Se autocierra

**En el browser**: firma con `josemanuel@wearecommonhouse.com`, click "Allow" al permiso de Drive. Cierra la pestaña cuando diga "✓ Authorized".

### 3 — Pegar el token en Vercel (3 min)

Vercel → proyecto → **Settings → Environment Variables → Production**.

Agregá las 3:

| Variable | Valor |
|---|---|
| `DRIVE_OAUTH_CLIENT_ID` | mismo valor que `GMAIL_CLIENT_ID` |
| `DRIVE_OAUTH_CLIENT_SECRET` | mismo valor que `GMAIL_CLIENT_SECRET` |
| `DRIVE_OAUTH_REFRESH_TOKEN` | el token que imprimió el script |

> **Pipe tip**: si los configurás vía `vercel env add` desde CLI, usá `printf "%s"` en vez de `echo` — `echo` agrega un `\n` final que puede corromper tokens.

### 4 — Redeploy (1 min)

Vercel deploy nuevo (o push a main dispara auto-deploy). Las env vars sólo cargan en runs nuevos.

---

## Verificación end-to-end

Después del redeploy, en `portal.wearecommonhouse.com/admin/plan/artifacts`:

1. Expandí cualquier artifact con preguntas respondidas
2. Click **Regenerate v2**
3. En el Version history debajo, v2 debe aparecer con el botón **Drive →** (no con badge amarillo "Drive sync pending")
4. Click el link → abre el Google Doc v2 en el mismo folder que v1

Si aparece "Drive sync pending" con v2, algo de las env vars no quedó. Check:
- Los 3 env vars están en Production scope (no Preview/Development)
- Hiciste redeploy después de agregarlos
- El refresh token no tiene espacios/newlines extras

---

## Failure modes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Script error "redirect_uri_mismatch" | No agregaste el redirect URI en Cloud Console | Paso 1b |
| Script error "invalid_client" | Client ID/secret de Gmail están mal en .env.local | Verificar .env.local |
| Script error "access_denied" | Cerraste el browser o denegaste el permiso | Re-run |
| Regenerate devuelve `drive_uploaded: false` en prod | Env vars no cargaron o token expiró | Redeploy, o re-run script |
| Regenerate devuelve 401 de Drive | Refresh token revocado | Re-run script + update Vercel |

---

## Rotación

Los refresh tokens expiran si:
- Cambiás tu password de Google
- Revocás la app desde tu cuenta Google
- 6 meses sin actividad (improbable, el loop lo mantiene vivo)

Cuando pase, corré el script otra vez y reemplazá `DRIVE_OAUTH_REFRESH_TOKEN` en Vercel. Los otros 2 no cambian.

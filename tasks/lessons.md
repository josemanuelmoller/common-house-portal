# Lessons — Common House OS v2

Lecciones acumuladas que cualquier sesión (Claude o humano) debe leer
antes de empezar un cambio no trivial en este repo. Versión repo-scoped
de la memoria — distinta de `~/.claude/.../memory/` (user-scoped).

## Cómo usar este archivo

**Antes de empezar:** escanea las secciones relevantes al área que tocas
(routes, agents, Supabase, Notion, Hall UI, etc.). Si una lección aplica,
síguela. Si crees que tu contexto invalida una lección, escala al owner
antes de actuar — no la revoques unilateralmente.

**Después de una corrección:** si el owner te corrige un patrón
recurrente o validas un enfoque no obvio, añade una lección al final con
fecha, regla, *Why*, *How to apply*. Append-only. No reescribir lecciones
viejas — si una queda obsoleta, marca `~~obsoleta~~` y enlaza la nueva.

**Formato de cada lección:**

```
### L-NNN — Título corto e imperativo

**Fecha:** YYYY-MM-DD  **Área:** routes | agents | supabase | notion | hall | infra

Regla en una línea.

**Why:** la razón concreta (incidente, restricción, decisión del owner).
**How to apply:** cuándo se activa, dónde mirar, qué hacer.
```

---

## Documentos canónicos — leer antes de tocar

Estas lecciones no se duplican aquí; el archivo enlazado es la fuente
de verdad. Esta sección es solo el índice.

- **Hard rules del repo** → [AGENTS.md](../AGENTS.md)
  Portal design, API route auth, client refresh checklist, E2E
  verification, runtime verification (producción es la verdad),
  Notion deprecation (cutoff 2026-06-02), pre-merge sanity checklist.
- **Patrones explícitamente rechazados** → [docs/migration/REJECTED_PATTERNS.md](../docs/migration/REJECTED_PATTERNS.md)
  R-001 write-through mirror, R-002 borrar migration SQL, R-003
  domain-tagging gateando creación de contactos.
- **Freeze Notion → Supabase** → [docs/SUPABASE_CONSOLIDATION_FREEZE.md](../docs/SUPABASE_CONSOLIDATION_FREEZE.md)
  Mapeo Notion → Supabase, qué se borra en Phase 6, cutoff.
- **Inventario Phase 4/5 (migración en curso)** → [docs/migration/PHASE_4_5_INVENTORY.md](../docs/migration/PHASE_4_5_INVENTORY.md)

---

## Lecciones

### L-001 — Verificar en producción, no en localhost

**Fecha:** 2026-04 (refinado 2026-05)  **Área:** verification

Un fix solo está hecho cuando el comportamiento visible está validado en
`portal.wearecommonhouse.com`. Verificar en localhost NO basta.

**Why:** localhost y prod difieren (env vars, Vercel project linkage,
Supabase project, runtime). Hubo casos donde localhost OK + prod roto
porque el deploy fue al Vercel project equivocado.
**How to apply:** después de deploy, abrir la URL afectada en producción
(Chrome MCP / Preview MCP) y reproducir el flujo. Declarar explícitamente
"Verified in production" — si dices "Verified in localhost", el fix NO
está cerrado.

---

### L-002 — Toda ruta mutante necesita auth local explícita

**Fecha:** 2026-04  **Área:** routes

`src/middleware.ts` marca `/api/*` como público. Clerk NO protege las
API routes. Cada ruta mutante necesita `adminGuardApi()` o check de
`CRON_SECRET` header.

**Why:** sin esto, cualquier visitante anónimo puede mutar Supabase /
Notion. Ya pasó: rutas mutantes mergeadas sin guard, expuestas en prod.
**How to apply:** crear ruta bajo `src/app/api/` → elegir patrón antes
de escribir el handler. Admin/UI → `adminGuardApi()`. Cron/agent →
`Authorization: Bearer $CRON_SECRET` o `x-agent-key`. Read-only público
documentado explícitamente en `docs/ROUTES_AND_SURFACES.md`.

---

### L-003 — Cliente que muta UI server-rendered necesita `router.refresh()`

**Fecha:** 2026-04  **Área:** hall | client components

Después de un POST/PATCH/DELETE exitoso desde un componente cliente, si
hay un server component arriba en el árbol que renderiza counters/listas
basados en la misma data, hay que llamar `router.refresh()` en el branch
de éxito.

**Why:** sin refresh, los counters quedan stale hasta que el usuario
navega fuera y vuelve. Ya pasó múltiples veces en Hall (sección queda
mostrando el item ya archivado).
**How to apply:** en el `if (res.ok)` después del fetch — `setLocalState(...)`
para feedback inmediato + `router.refresh()` para re-render del server.
Nunca `window.location.reload()` (limpia state). Si es server action, usar
`revalidatePath()` en su lugar.

---

### L-004 — Nunca extender el mirror Notion ↔ Supabase

**Fecha:** 2026-05-05 (rechazado por owner)  **Área:** notion | supabase

No añadir nuevos exports a `src/lib/notion-mirror-push.ts`,
`src/lib/notion-mirror.ts`, `src/lib/notion-push.ts`. No añadir nuevos
call sites de `notion.pages.create/update`, `notion.databases.update`,
`notion.blocks.children.append` en `src/`.

**Why:** el owner rechazó explícitamente el patrón "write-through mirror".
Ver [R-001 en REJECTED_PATTERNS.md](../docs/migration/REJECTED_PATTERNS.md).
Cutoff Notion read-only = 2026-06-02. La dirección es eliminar escrituras,
no añadirlas.
**How to apply:** antes de proponer cualquier escritura a Notion, leer
R-001. Si una superficie de Hall todavía lee del mirror, migrarla a leer
de la tabla Supabase canónica (freeze §3) en vez de mantener el mirror.

---

### L-005 — Soluciones sistémicas, nunca parches

**Fecha:** 2026-05-06 (explícito del owner)  **Área:** all

No proponer workarounds que escondan un problema real. Diagnosticar y
arreglar la causa raíz. Si encuentras un obstáculo, no uses una acción
destructiva como atajo para hacerlo desaparecer.

**Why:** los parches generan deuda invisible que reaparece como bugs en
prod semanas después. El owner es explícito: prefiere ver el problema y
arreglarlo bien.
**How to apply:** si te encuentras escribiendo "temporary fix", "TODO:
proper solution later", o silenciando un error sin entenderlo — para y
pregunta. La pausa para entender es más barata que el bug futuro.

---

### L-006 — Fallback observable, nunca silencioso

**Fecha:** 2026-04  **Área:** observability | hall

Cualquier code path que falle desde fuente primaria a secundaria debe:
emitir warning en runtime logs, ser detectable en debugging, no parecer
un éxito sano del path primario.

**Why:** ya pasó — Hall mostraba data del fallback (Notion) durante
semanas mientras el path Supabase estaba roto. Logs mostraban 200 OK,
nadie notó la degradación.
**How to apply:** después de un `catch` que activa fallback, loggear
explícitamente `WARN: primary path failed, using fallback X`. Para
superficies críticas (Hall), considerar source indicator visible en UI
(`Source: loop-engine` vs `Source: notion-fallback`).

---

### L-007 — `printf "%s"`, nunca `echo`, al pasar secrets a Vercel CLI

**Fecha:** 2026-04  **Área:** infra

Al añadir env vars vía Vercel CLI, usar `printf "%s" "$VALUE" | vercel env add NAME production`
en lugar de `echo`.

**Why:** `echo` añade newline final que corrompe silenciosamente URLs,
keys, secrets. El runtime lee un valor con `\n` al final, falla con
errores opacos.
**How to apply:** ningún `echo` para secrets. Después de añadir env var,
verificar desde el runtime de producción (no solo en el CLI) que el
valor llega correctamente.

---

### L-008 — `200 OK` con data vacía cuenta como fallo

**Fecha:** 2026-04  **Área:** supabase | verification

Después de deploy o cambio de env que afecta Supabase, llamar la API
route de producción que depende de esa fuente y confirmar que devuelve
los registros esperados. NO basta con `200 OK`.

**Why:** una ruta puede responder 200 con array vacío porque las env
vars apuntan al project equivocado, RLS bloquea, o la tabla no existe
en ese project. El status code engaña.
**How to apply:** verificación de Supabase = llamar la ruta + contar
filas devueltas vs. filas esperadas en la tabla. Si vacío inesperado,
es failure condition.

---

### L-009 — Trigger backfill cuando cambia clasificación, no gatear creación

**Fecha:** 2026-05-05  **Área:** people | engagements

No condicionar la creación de `people` rows a que el dominio ya esté
clasificado. Crear o backfillear desde `hall_email_observations` /
`hall_transcript_observations` / `conversation_messages` cuando:
clasificación cambia, nueva engagement, o decision_item resuelto.

**Why:** la clasificación es señal humana lenta que lagueea evidencia
por semanas. Gatear creación deja contactos históricos invisibles
justo cuando los necesitas (caso Engatel: 80+ mensajes, 0 contactos
visibles). Ver R-003.
**How to apply:** usar `src/lib/promote-people-from-observations.ts`
desde los 4 trigger points. Además: reconciler diario que recorre
dominios clasificados y asegura `people` row por email observado.

---

### L-010 — Notion property accessor debe match el tipo real

**Fecha:** recurrente  **Área:** notion

Antes de leer/escribir una property de Notion, verificar el tipo
exacto en la DB (no asumir). Usar `text()` solo en `rich_text`,
`select()` solo en `select`, `checkbox()` solo en `checkbox`, etc.

**Why:** mismatch silencioso — el accessor devuelve `undefined` o `""`
sin error visible. Bug reaparece como "el campo no se guarda" o "el
filtro no encuentra nada". Ya pasó con `"Draft Text"` vs `"Content"`,
`"Channel"` vs `"Platform"`, `"P1"` vs `"P1 Critical"`.
**How to apply:** read filter = write value = UI comparison, los tres
con el mismo string literal. Si tocas una property, hacer grep del
nombre en todo `src/` y verificar consistencia end-to-end.

---

### L-011 — Dismiss = permanente; cualquier TTL es bug

**Fecha:** 2026-05-18  **Área:** hall | UX

Si un botón se llama "Dismiss", "Discard", "Acknowledge — not pursuing",
"Ignore", "Skip" o equivalente, su consecuencia backend DEBE ser
permanente. No 24h, no 30 días. La única resurrección aceptable es
cuando algo materialmente nuevo cambia (signal nuevo, fingerprint
distinto). Un "Snooze X días" es lo opuesto — semántica explícita y
temporal, eso sí puede tener TTL exacto.

**Why:** "no que reviva cada 30 días, sino arrastro basura". El usuario
descartó las mismas cards 5+ veces a lo largo de 16 días porque el
backend trataba "Dismiss" como TTL 24h (STB) o snooze 30d (pipeline) o
solo cerraba el log sin persistir nada (push notifications). El TTL
mental "para que no se acumule" es el anti-patrón — la pila se ensucia
sola, no porque haya dismissed forever.
**How to apply:**
1. Antes de mergear un botón nuevo, verificar: ¿el label promete
   acción duradera? Si sí, el write debe persistir sin expiry.
2. Implementación: `until_at = '9999-12-31T23:59:59Z'` sentinel en
   `hall_snoozes`, o columna dedicada `dismissed_at` sin expiry.
3. Escape: el reader puede auto-lift cuando llega signal nuevo
   (`lastSignal > snoozed_at`). Eso respeta intención del usuario sin
   enterrar para siempre lo que se reactivó.
4. No usar localStorage como única persistencia — pierde state al
   cambiar browser/device. Persistir server-side.

---

### L-012 — Guards por entityType/reason que excluyen casos silenciosamente

**Fecha:** 2026-05-18  **Área:** pipeline | backend

Cuando una función toma dispatcher fields (`entityType`, `reason`,
`source_type`), evitar guards tipo `if (entityType === "X")` sin
fallback explícito. Si el guard excluye un caso, ese caso pasa por la
función sin efecto observable — bug invisible hasta que el usuario lo
nota meses después.

**Why:** B-002 ocultó por meses que `manualResolve` solo snoozeaba
organizations, no opportunities, porque tenía
`if (closeUnderlying && reason === "drift" && entityType === "organization")`.
El user clicaba "Acknowledge — not pursuing" en opportunities y nada
persistía. El log cerraba (parecía éxito) pero el snooze nunca se
escribía.
**How to apply:**
1. Antes de escribir `if (entityType === X)`, preguntarse: ¿qué pasa
   si entityType es otro valor válido? Si la respuesta es "no hace
   nada", agregar `else` explícito (incluso si solo es `console.warn`).
2. Preferir `switch` exhaustivo con `default: throw` o `default:
   <fallback razonable>` sobre `if` aislado.
3. Tests: si una función toma dispatcher, cubrir TODOS los valores
   posibles, no solo el happy path.

---

### L-013 — Tablas huérfanas: escritura sin reader

**Fecha:** 2026-05-18  **Área:** backend

Cuando un endpoint persiste un cambio (dismiss, archive, ignore),
verificar que TODOS los readers downstream filtren por esa marca. Una
escritura sin reader correspondiente es deuda invisible — la UI dice
"hecho", la DB tiene el row, pero el cron/render siguiente lo ignora
y el item resurge.

**Why:** auditoría Hall 2026-05-18 encontró 4 casos: `hall_commitment_dismissals`
(ruta deprecated, ningún reader), `inbox_ignores` (verificar readers),
`watchlist_entities.payload.archived` (verificar GET filter), y push
notification snooze (¡tabla ni siquiera existe!).
**How to apply:**
1. Después de añadir una columna `dismissed_at` / `archived_at` / etc,
   grep todos los readers de esa tabla y confirmar que filtran por el
   nuevo flag.
2. Tablas mirror legacy: si una ruta escribe a una tabla X pero ya nadie
   lee de X, devolver `410 Gone` en lugar de seguir escribiendo
   silenciosamente.
3. Cero tolerancia a stubs con `console.log` + `return ok` — si no se
   puede implementar, cambiar el label del botón.

---

## Plantilla para nueva lección

Copiar al final y rellenar:

```
### L-NNN — Título imperativo corto

**Fecha:** YYYY-MM-DD  **Área:** routes | agents | supabase | notion | hall | infra | other

Regla en una línea.

**Why:** razón concreta.
**How to apply:** cuándo se activa, dónde mirar, qué hacer.
```

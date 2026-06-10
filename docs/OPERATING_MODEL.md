# Common House — Operating Model (AI-first)

> Adoptado 2026-06-10. El portal no es un sitio de 34 páginas: es un equipo de
> 5 empleados digitales que le TRAEN el trabajo a José. Las páginas son
> drill-down; nunca el punto de entrada.

## El principio rector

**Si requiere la decisión de José, debe llegar a su flujo (Hall, push, morning
brief) — no esperar una visita.** La telemetría de junio 2026 lo demostró:
José vive en el Hall (~1 visita/día) y en reuniones; toda cola que vivía solo
en una sub-página murió (decision_items: 7 semanas sin un resolve; content
pitches: semanas sin aprobar; drafts: 37 acumulados).

La métrica de éxito del portal: **decisiones tomadas desde el flujo por día**
(`hall_events.decision_resolved_from_flow`, `proposal_outcomes`,
`stb_accept/dismiss`) — no páginas con datos.

## Los 5 empleados

### 1. Chief of Staff (operación diaria)
- **Vive en:** el Hall (`/admin`) + push digest 06:30 UK.
- **Hace:** ingesta Gmail/Fireflies/WhatsApp/Drive → `action_items` con effort;
  Focus of the Day evidence-backed; Suggested Time Blocks (3 gates:
  effort/window/pressure); Commitments ledger; prep briefs on-demand.
- **Entrada de trabajo para José:** morning brief strip (`☀ HOY:`) + push +
  secciones del Hall. Todo accionable inline.

### 2. Analyst (conocimiento e inteligencia)
- **Vive en:** daily briefing (sección Knowledge Hot) + prep briefs + reading room.
- **Hace:** knowledge-curator (diario 03:30) destila evidencia al árbol;
  synthesize-leaf (sábados) convierte bullets en playbooks narrativos;
  los playbooks fluyen al prep brief (top leaf, extracto 2.5k); landscape de
  1,468 operadores para research.
- **Regla:** el conocimiento que no vuelve al output no existe.

### 3. BizDev (pipeline comercial)
- **Vive en:** "Needs your call" (Hall) + `/admin/opportunities` (superficie
  única — pipeline y ops-mirror redirigen aquí) + Grants opt-in.
- **Hace:** promotion-scan diario propone reclasificaciones; grant-radar
  semanal; stale-decay archiva Stalled sin señal >60d; Pipeline State vigila
  drift/pelotas en cancha con CTAs honestos (Link contact / Draft check-in).

### 4. Comms (contenido)
- **Vive en:** Content pitches (Hall · Signals tab) + Agent Queue.
- **Hace:** propose-content-pitches (último viernes del mes) → José aprueba
  inline → linkedin-post genera borrador → Outbox para sign-off → Gmail/Notion.
  Brand Brain (style profiles) alimenta el tono.
- **Pendiente Phase 6:** publish nativo en portal (hoy el último paso vive en
  Notion).

### 5. Portfolio/CFO (números y portfolio)
- **Vive en:** The Plan (`/admin/plan`) + Garage.
- **Hace:** compute-kpi diario (revenue real vía Xero cuando José conecte la
  app — ver docs/integrations), objetivos → Focus scoring, plan-master genera
  artifacts de objetivos estancados.
- **Estado:** infraestructura lista, datos pendientes (Xero env vars, cap
  table/valuations vacíos hasta el primer garage-upload real).

## Reglas de plataforma que protegen el modelo

1. **Sin evidencia, no hay tarjeta** — toda sugerencia cita su porqué
   (compromiso, deadline, señal). La sección vacía es un resultado válido.
2. **Toda tarjeta se cierra desde la tarjeta** — nunca un nag sin botón que
   resuelva la causa raíz; nunca un "✓ éxito" falso (fallos = 422 con nota).
3. **El sistema confiesa cuando está enfermo** — HallPipelineHealth strip;
   fallbacks visibles; errores en debug_log/routine_runs.
4. **Una verdad por entidad** — opportunities en `/admin/opportunities`;
   decisiones en el Hall/OS; drafts en canonical `agent_drafts`. Los espejos
   notion_* mueren en Phase 6.
5. **El portal aprende** — dismissals bajan la confianza del tipo de bloque
   (30d, mín 5 decisiones); approvals la sostienen.
6. **Vercel Hobby:** cada cron ≤ 1 vez/día por expresión; paths duplicados con
   horas únicas es el patrón válido para cadencia sub-diaria.

## Qué NO construir (hasta que cambie la realidad)

- Superficies nuevas que dependan de visitas diarias (no las habrá).
- My Rooms / capas multi-staff — sin equipo configurado aún.
- Automatización de publicación al Living Room — curaduría manual es la
  decisión de diseño (privacidad).
- Pre-generación de prep briefs — José los usa poco; on-demand + retry basta.

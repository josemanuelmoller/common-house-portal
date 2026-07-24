/**
 * i18n de la sala de trabajo. Diccionario ES/EN + `makeT`.
 * El toggle traduce TODO el chrome de la sala (nav, secciones, botones, estados,
 * etiquetas, vacíos, toasts) — no solo el sidebar. El contenido cargado por el
 * usuario (títulos de tareas, texto de decisiones) queda como fue escrito.
 * El idioma por defecto viene del proyecto (projects.room_language; Oceana='en').
 */

export type Lang = "es" | "en";

const ES: Record<string, string> = {
  // chrome
  "chrome.workRoom": "Sala de trabajo", "chrome.rooms": "Salas", "chrome.yourRole": "Tu rol en esta sala",
  "chrome.collapse": "Colapsar", "chrome.expand": "Expandir", "chrome.openNav": "Abrir navegación", "chrome.room": "Sala", "chrome.myDesk": "Mi escritorio",
  // nav
  "nav.mio": "Lo mío", "nav.resumen": "Resumen", "nav.plan": "Plan", "nav.entregables": "Entregables",
  "nav.tareas": "Tareas", "nav.decisiones": "Decisiones", "nav.materiales": "Materiales", "nav.reuniones": "Reuniones", "nav.proyecto": "Proyecto", "nav.actividad": "Actividad",
  "meet.desc": "Cada reunión del proyecto se procesa y aterriza acá sola.", "meet.none": "Todavía no hay reuniones registradas.",
  // roles
  "role.pm": "PM", "role.collaborator": "Colaborador", "role.client": "Cliente", "role.reader": "Lector",
  // stats
  "stat.avance": "Avance", "stat.entregables": "Entregables", "stat.tareasHechas": "Tareas hechas", "stat.bloqueadas": "Bloqueadas",
  // deliverable statuses
  "ds.not_started": "Por iniciar", "ds.in_progress": "En curso", "ds.at_risk": "En riesgo", "ds.delivered": "Entregado", "ds.accepted": "Aceptado",
  // task statuses
  "ts.todo": "Por hacer", "ts.doing": "En curso", "ts.blocked": "Bloqueada", "ts.done": "Hecha",
  // views / buttons / words
  "view.list": "Lista", "view.kanban": "Kanban",
  "btn.addDeliverable": "+ Entregable", "btn.addTask": "+ Tarea", "btn.addDecision": "+ Decisión",
  "btn.acceptDeliverable": "Aceptar entregable", "btn.resolveDecision": "Resolver decisión", "btn.undo": "Deshacer", "btn.markDone": "Marcar hecha",
  "word.tasks": "tareas", "word.person": "persona", "word.people": "personas", "word.access": "con acceso a la sala.",
  // plan
  "plan.doneTag": "cumplida", "plan.inProgressTag": "en curso", "plan.upcomingTag": "por venir",
  "plan.noPhases": "Todavía no hay fases.", "plan.noDeliverablesInPhase": "Sin entregables en esta fase.",
  // deliverables
  "deliv.none": "Todavía no hay entregables.", "deliv.cantMove": "Tu rol no puede mover entregables (solo mirar).",
  // tasks
  "tasks.none": "Todavía no hay tareas.", "tasks.cantMove": "Tu rol no puede mover tareas (solo mirar).",
  "tasks.client": "cliente", "tasks.evidence": "✓ evidencia", "tasks.attested": "✍ atestiguada",
  // decisions
  "dec.title": "Decisiones", "dec.none": "Todavía no hay decisiones.", "dec.open": "Abierta", "dec.closed": "Cerrada", "dec.present": "Presentes",
  // materials
  "mat.title": "Materiales", "mat.none": "Todavía no hay materiales.", "mat.readonly": "solo lectura",
  "matcat.invoice": "Factura", "matcat.presentation": "Presentación", "matcat.multimedia": "Multimedia", "matcat.manual": "Manual",
  "matcat.plan_timeline": "Plan / cronograma", "matcat.contract_agreement": "Contrato", "matcat.working_document": "Documento de trabajo",
  // activity
  "act.title": "Actividad", "act.none": "Sin actividad todavía.",
  "act.desc": "Registro del event log — quién hizo qué. Carga y aporte, no vigilancia. Solo lo ve el PM.",
  // lo mío
  "mio.title": "Lo mío", "mio.desc": "Tus tareas y entregables en esta sala.",
  "mio.noPerson": "Tu usuario todavía no está vinculado a una persona en esta sala.",
  "mio.nothing": "No tenés tareas ni entregables asignados. 🎈", "mio.myTasks": "Mis tareas", "mio.myDeliverables": "Mis entregables",
  // proyecto
  "proj.origin": "Origen", "proj.originNote": "Heredado de la preventa.", "proj.team": "Equipo", "proj.admin": "Administrativo",
  "field.org": "Organización", "field.location": "Sede", "field.engagement": "Modelo de trabajo", "field.type": "Tipo de proyecto",
  "field.geography": "Geografía", "field.start": "Inicio", "field.end": "Cierre objetivo", "field.code": "Código",
  "field.focus": "Foco actual", "field.milestone": "Próximo hito",
  "proj.driveFolder": "Carpeta Drive ↗", "proj.presaleRoom": "Sala de preventa ↗", "proj.clientWeb": "Web del cliente ↗",
  "proj.noMembers": "Todavía no hay miembros.", "proj.chTitle": "Datos de cobro · Common House", "proj.clientBillingTitle": "Facturación del cliente",
  "bill.legalName": "Razón social", "bill.taxId": "Tax ID", "bill.vat": "VAT", "bill.address": "Dirección",
  "bill.billingEmail": "Email de facturación", "bill.contact": "Contacto", "bill.po": "Orden de compra",
  "proj.clientBillingEmpty": "El cliente todavía no cargó sus datos de facturación.", "proj.noAdmin": "Sin datos administrativos.",
  "side.team": "Equipo", "side.client": "Cliente",
  // toasts
  "toast.accepted": "Entregable aceptado", "toast.acceptUndone": "Aceptación deshecha",
  "toast.taskClosed": "Tarea cerrada · atestiguada por ti", "toast.taskReopened": "Tarea reabierta",
  "toast.decisionResolved": "Decisión resuelta", "toast.decisionReopened": "Decisión reabierta",
  // prompts
  "prompt.newDeliverable": "Nuevo entregable:", "prompt.newTask": "Nueva tarea:", "prompt.newDecision": "Nueva decisión:",
  // empty-state (sala recién abierta)
  "empty.title": "Arranquemos la sala", "empty.lead": "La sala no parte de cero: hereda lo de la preventa.",
  "empty.inheritedTitle": "Heredado de la preventa", "empty.withAccess": "con acceso",
  "empty.drive": "Carpeta de Drive vinculada", "empty.presale": "Sala de preventa",
  "empty.meetings": "El proyecto ya existe — las reuniones se procesan solas",
  "empty.suggestedTitle": "Estructura sugerida", "empty.suggestedNote": "Aprobála para arrancar — después la editás.",
  "empty.fromProposal": "desde la propuesta", "empty.fromTemplate": "template inicial",
  "empty.approve": "Aprobar estructura y arrancar", "empty.pmWillApprove": "El PM va a aprobar la estructura para arrancar.",
  "toast.structureCreated": "Estructura creada · sala en marcha",
};

const EN: Record<string, string> = {
  "chrome.workRoom": "Work room", "chrome.rooms": "Rooms", "chrome.yourRole": "Your role in this room",
  "chrome.collapse": "Collapse", "chrome.expand": "Expand", "chrome.openNav": "Open navigation", "chrome.room": "Room", "chrome.myDesk": "My desk",
  "nav.mio": "My work", "nav.resumen": "Overview", "nav.plan": "Plan", "nav.entregables": "Deliverables",
  "nav.tareas": "Tasks", "nav.decisiones": "Decisions", "nav.materiales": "Materials", "nav.reuniones": "Meetings", "nav.proyecto": "Project", "nav.actividad": "Activity",
  "meet.desc": "Every project meeting is processed and lands here automatically.", "meet.none": "No meetings recorded yet.",
  "role.pm": "PM", "role.collaborator": "Collaborator", "role.client": "Client", "role.reader": "Reader",
  "stat.avance": "Progress", "stat.entregables": "Deliverables", "stat.tareasHechas": "Tasks done", "stat.bloqueadas": "Blocked",
  "ds.not_started": "Not started", "ds.in_progress": "In progress", "ds.at_risk": "At risk", "ds.delivered": "Delivered", "ds.accepted": "Accepted",
  "ts.todo": "To do", "ts.doing": "In progress", "ts.blocked": "Blocked", "ts.done": "Done",
  "view.list": "List", "view.kanban": "Board",
  "btn.addDeliverable": "+ Deliverable", "btn.addTask": "+ Task", "btn.addDecision": "+ Decision",
  "btn.acceptDeliverable": "Accept deliverable", "btn.resolveDecision": "Resolve decision", "btn.undo": "Undo", "btn.markDone": "Mark done",
  "word.tasks": "tasks", "word.person": "person", "word.people": "people", "word.access": "with access to the room.",
  "plan.doneTag": "completed", "plan.inProgressTag": "in progress", "plan.upcomingTag": "upcoming",
  "plan.noPhases": "No phases yet.", "plan.noDeliverablesInPhase": "No deliverables in this phase.",
  "deliv.none": "No deliverables yet.", "deliv.cantMove": "Your role can't move deliverables (view only).",
  "tasks.none": "No tasks yet.", "tasks.cantMove": "Your role can't move tasks (view only).",
  "tasks.client": "client", "tasks.evidence": "✓ evidence", "tasks.attested": "✍ attested",
  "dec.title": "Decisions", "dec.none": "No decisions yet.", "dec.open": "Open", "dec.closed": "Closed", "dec.present": "Present",
  "mat.title": "Materials", "mat.none": "No materials yet.", "mat.readonly": "read only",
  "matcat.invoice": "Invoice", "matcat.presentation": "Presentation", "matcat.multimedia": "Multimedia", "matcat.manual": "Manual",
  "matcat.plan_timeline": "Plan / timeline", "matcat.contract_agreement": "Contract", "matcat.working_document": "Working document",
  "act.title": "Activity", "act.none": "No activity yet.",
  "act.desc": "Event log — who did what. Contribution, not surveillance. PM-only.",
  "mio.title": "My work", "mio.desc": "Your tasks and deliverables in this room.",
  "mio.noPerson": "Your account isn't linked to a person in this room yet.",
  "mio.nothing": "You have no assigned tasks or deliverables. 🎈", "mio.myTasks": "My tasks", "mio.myDeliverables": "My deliverables",
  "proj.origin": "Origin", "proj.originNote": "Inherited from pre-sale.", "proj.team": "Team", "proj.admin": "Billing",
  "field.org": "Organization", "field.location": "Location", "field.engagement": "Engagement model", "field.type": "Project type",
  "field.geography": "Geography", "field.start": "Start", "field.end": "Target close", "field.code": "Code",
  "field.focus": "Current focus", "field.milestone": "Next milestone",
  "proj.driveFolder": "Drive folder ↗", "proj.presaleRoom": "Pre-sale room ↗", "proj.clientWeb": "Client website ↗",
  "proj.noMembers": "No members yet.", "proj.chTitle": "Billing details · Common House", "proj.clientBillingTitle": "Client billing",
  "bill.legalName": "Legal name", "bill.taxId": "Tax ID", "bill.vat": "VAT", "bill.address": "Address",
  "bill.billingEmail": "Billing email", "bill.contact": "Contact", "bill.po": "Purchase order",
  "proj.clientBillingEmpty": "The client hasn't submitted billing details yet.", "proj.noAdmin": "No billing data.",
  "side.team": "Team", "side.client": "Client",
  "toast.accepted": "Deliverable accepted", "toast.acceptUndone": "Acceptance undone",
  "toast.taskClosed": "Task closed · attested by you", "toast.taskReopened": "Task reopened",
  "toast.decisionResolved": "Decision resolved", "toast.decisionReopened": "Decision reopened",
  "prompt.newDeliverable": "New deliverable:", "prompt.newTask": "New task:", "prompt.newDecision": "New decision:",
  "empty.title": "Let's start the room", "empty.lead": "The room doesn't start from scratch — it inherits from pre-sale.",
  "empty.inheritedTitle": "Inherited from pre-sale", "empty.withAccess": "with access",
  "empty.drive": "Drive folder linked", "empty.presale": "Pre-sale room",
  "empty.meetings": "The project already exists — meetings are processed automatically",
  "empty.suggestedTitle": "Suggested structure", "empty.suggestedNote": "Approve to start — you can edit it later.",
  "empty.fromProposal": "from the proposal", "empty.fromTemplate": "starter template",
  "empty.approve": "Approve structure & start", "empty.pmWillApprove": "The PM will approve the structure to start.",
  "toast.structureCreated": "Structure created · room is live",
};

const STR: Record<Lang, Record<string, string>> = { es: ES, en: EN };

export type TFn = (key: string, fallback?: string) => string;

export function makeT(lang: Lang): TFn {
  return (key, fallback) => STR[lang][key] ?? STR.es[key] ?? fallback ?? key;
}

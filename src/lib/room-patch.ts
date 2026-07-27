import "server-only";

/**
 * Patches parciales para las rutas de edición de la sala.
 *
 * Contrato: una clave AUSENTE del body no se toca; una clave presente con null
 * o "" limpia la columna. Sin esa distinción no se puede diferenciar "no abrí
 * el campo responsable" de "le saqué el responsable", y un editor que manda el
 * objeto entero terminaría borrando lo que el usuario nunca tocó.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldSpec = {
  key: string;                    // nombre en el body
  col: string;                    // columna en la tabla
  label: string;                  // para el mensaje de error
  required?: boolean;             // presente pero vacío = 400 en vez de null
  check?: (v: string) => boolean;
};

export type PatchResult =
  | { ok: true; patch: Record<string, string | null>; touched: string[] }
  | { ok: false; error: string };

export function buildPatch(body: Record<string, unknown>, specs: FieldSpec[]): PatchResult {
  const patch: Record<string, string | null> = {};
  const touched: string[] = [];

  for (const f of specs) {
    if (!(f.key in body)) continue;
    const raw = body[f.key];
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return { ok: false, error: `${f.label}: valor inválido` };
    }
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) {
      if (f.required) return { ok: false, error: `${f.label} no puede quedar vacío` };
      patch[f.col] = null;
      touched.push(f.col);
      continue;
    }
    if (f.check && !f.check(v)) return { ok: false, error: `${f.label}: valor inválido` };
    patch[f.col] = v;
    touched.push(f.col);
  }

  return { ok: true, patch, touched };
}

/**
 * Antes/después de las columnas que realmente cambiaron. Va al payload del
 * evento de sala: la Actividad muestra qué cambió, no sólo que alguien editó.
 */
export function fieldDiff(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [col, to] of Object.entries(patch)) {
    const from = before[col] ?? null;
    const next = to ?? null;
    if (from !== next) diff[col] = { from, to: next };
  }
  return diff;
}

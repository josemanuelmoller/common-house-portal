/**
 * POST /api/admin/projects/[id]/promote-to-room
 *
 * Pasa un lobby (preventa) a sala de trabajo: miembros desde los accesos del
 * lobby, atribución de las fuentes de la organización, y los acuerdos ya
 * respondidos como decisiones cerradas. Ver src/lib/promote-to-room.ts para el
 * detalle de qué hace y qué deja a propósito en manos de una persona.
 *
 * Body: { includeClient?: boolean, dryRun?: boolean }
 *   - dryRun (por defecto TRUE): calcula y reporta sin escribir. Hay que pedir
 *     explícitamente dryRun:false para que toque nada — esto mueve accesos de
 *     clientes reales, y el default seguro es mirar antes.
 *   - includeClient: suma también a la gente del cliente. Por defecto no: la
 *     sala se abre en la sesión de inicio, no al ganar el trato.
 *
 * Auth: sesión de admin de Clerk.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { requireSameOriginRequest } from "@/lib/require-same-origin";
import { promoteLobbyToRoom } from "@/lib/promote-to-room";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sameOrigin = requireSameOriginRequest(req);
  if (sameOrigin) return sameOrigin;
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  let body: { includeClient?: boolean; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* body opcional */ }

  const user = await currentUser();
  const actorEmail = user?.primaryEmailAddress?.emailAddress ?? "admin";

  try {
    const report = await promoteLobbyToRoom(id, {
      includeClient: body.includeClient === true,
      // Escribe sólo si se pide explícitamente.
      dryRun: body.dryRun !== false,
      actorEmail,
    });
    return NextResponse.json({ ok: true, dryRun: body.dryRun !== false, report });
  } catch (err) {
    // El error detallado va a los logs de Vercel, no al cliente: los errores de
    // Supabase traen nombres de tablas y constraints.
    return apiError(err, { route: "[/api/admin/projects/[id]/promote-to-room]", status: 400 });
  }
}

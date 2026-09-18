import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";

/** Deja un registro de quién hizo qué en una operación sensible (retiros, márgenes, etc). */
export async function registrarAuditoria(params: {
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle?: string;
}) {
  const usuario = await getUsuarioActual();
  const supabase = createServiceClient();
  await supabase.from("historial_auditoria").insert({
    usuario_id: usuario?.id ?? null,
    usuario_nombre: usuario?.nombre ?? usuario?.email ?? null,
    accion: params.accion,
    entidad: params.entidad,
    entidad_id: params.entidadId ?? null,
    detalle: params.detalle ?? null,
  });
}

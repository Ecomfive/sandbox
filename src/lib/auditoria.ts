import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";

export { calcularCambios } from "@/lib/auditoria-cambios";

/** Deja un registro de quién hizo qué en una operación sensible (retiros, márgenes, etc).
 * Si el cambio es sobre campos puntuales, pasa `antes`/`despues` con los mismos nombres de
 * campo y valores ya listos para mostrar (ej. {Estado: "Abierto"} -> {Estado: "Cerrado"}) —
 * se muestran como "Campo: antes → después" en el historial. */
export async function registrarAuditoria(params: {
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle?: string;
  antes?: Record<string, string>;
  despues?: Record<string, string>;
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
    antes: params.antes ?? null,
    despues: params.despues ?? null,
  });
}

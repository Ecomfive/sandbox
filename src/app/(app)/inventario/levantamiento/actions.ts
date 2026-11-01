"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarConteo } from "@/lib/wms/levantamiento";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/**
 * Guarda un levantamiento (conteo físico) de una bodega propia: cada producto contado queda en lo contado y la diferencia
 * se anota como ajuste (`wms_registrar_conteo`, migración 0214). Devuelve el error como valor.
 */
export async function guardarLevantamiento(
  bodegaId: string,
  referencia: string,
  items: unknown,
): Promise<{ error?: string; productos?: number; ajustes?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisado = revisarConteo(items);
  if ("error" in revisado) return { error: revisado.error };
  const ref = referencia.replace(/\s+/g, " ").trim().slice(0, 120);

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  const { data, error } = await supabase.rpc("wms_registrar_conteo", {
    p_bodega: bodegaId,
    p_items: revisado.items,
    p_referencia: ref || null,
    p_usuario: usuario.id,
  });
  if (error) {
    if (/wms_registrar_conteo/.test(error.message)) return { error: "Falta correr la migración 0214 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo guardar el levantamiento." };
  }
  const r = (data ?? {}) as { productos?: number; ajustes?: number };
  await registrarAuditoria({
    accion: "levantamiento_inventario",
    entidad: "wms_bodegas",
    entidadId: bodegaId,
    detalle: `Levantamiento${ref ? ` «${ref}»` : ""}: ${r.productos ?? 0} productos contados, ${r.ajustes ?? 0} con diferencia`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/levantamiento");
  return { productos: r.productos ?? 0, ajustes: r.ajustes ?? 0 };
}

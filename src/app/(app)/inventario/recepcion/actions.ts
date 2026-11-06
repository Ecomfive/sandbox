"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarRecepcion } from "@/lib/wms/recepcion";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/** Recibe productos de una compra: cuenta contra lo pedido y entra al inventario en un solo paso (`wms_recibir_compra`, migración 0241). Devuelve el error como valor. */
export async function recibirCompra(compraId: string, bodegaId: string, items: unknown): Promise<{ error?: string; lineas?: number; unidades?: number; faltan?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(compraId)) return { error: "Compra no válida." };
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisado = revisarRecepcion(items);
  if ("error" in revisado) return { error: revisado.error };
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  const { data, error } = await supabase.rpc("wms_recibir_compra", { p_compra: compraId, p_bodega: bodegaId, p_items: revisado.items, p_usuario: usuario.id });
  if (error) {
    if (error.code === "PGRST202" || /wms_recibir_compra/.test(error.message)) return { error: "Falta correr la migración 0241 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo recibir la compra." };
  }
  const r = (data ?? {}) as { lineas?: number; unidades?: number; faltan?: number };
  const { data: compra } = await supabase.from("wms_compras").select("codigo").eq("id", compraId).maybeSingle();
  await registrarAuditoria({
    accion: "recepcion_compra",
    entidad: "wms_compras",
    entidadId: compraId,
    detalle: `${compra?.codigo ?? "Compra"}: ${r.lineas ?? 0} productos, ${r.unidades ?? 0} u. recibidas${r.faltan ? `, faltaron ${r.faltan} u.` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/recepcion");
  revalidatePath("/compras", "layout");
  return { lineas: r.lineas ?? 0, unidades: r.unidades ?? 0, faltan: r.faltan ?? 0 };
}

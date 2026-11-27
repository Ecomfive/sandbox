"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { alcanceInventario, SOLO_A_CARGO } from "@/lib/permisos/inventario";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarTrasladoDanado } from "@/lib/wms/defectuosos";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Transfiere unidades dañadas de una bodega a otra (27 nov 2026, pedido de Hernán: «que a Dinora le dé la opción de transferirlos entre bodegas»). Solo la persona a cargo del inventario o un administrador, como
 * cualquier traslado. Las unidades salen de lo dañado del origen y entran como dañadas al destino (`wms_transferir_danado`, migración 0372); las dos bodegas propias y del mismo país.
 */
export async function transferirDefectuoso(d: { skuId: unknown; desde: unknown; hacia: unknown; cantidad: unknown; motivo?: unknown }): Promise<{ error?: string; mensaje?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (alcanceInventario(usuario) !== "total") return { error: SOLO_A_CARGO };
  if (!ES_ID(d?.skuId) || !ES_ID(d?.desde)) return { error: "Producto o bodega no válidos." };
  if (d.hacia !== undefined && d.hacia !== "" && !ES_ID(d.hacia)) return { error: "Elige a qué bodega van." };
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, d.desde)) || (ES_ID(d.hacia) && !(await puedeVerBodega(supabase, usuario.paisesPermitidos, d.hacia)))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const [{ data: fila }, { data: maestro }, { data: bodegas }] = await Promise.all([
    supabase.from("wms_stock").select("danado").eq("sku_maestro_id", d.skuId).eq("bodega_id", d.desde).maybeSingle(),
    supabase.from("skus_maestros").select("codigo, nombre").eq("id", d.skuId).maybeSingle(),
    supabase.from("wms_bodegas").select("id, nombre").in("id", [d.desde, ...(ES_ID(d.hacia) ? [d.hacia] : [])]),
  ]);
  if (!maestro) return { error: "El producto ya no existe." };
  const r = revisarTrasladoDanado({ desde: d.desde, hacia: d.hacia, cantidad: d.cantidad, danado: Math.max(0, Number(fila?.danado ?? 0)), motivo: d.motivo });
  if ("error" in r) return r;
  const { error } = await supabase.rpc("wms_transferir_danado", { p_sku: d.skuId, p_desde: d.desde, p_hacia: r.hacia, p_cantidad: r.cantidad, p_motivo: r.motivo, p_usuario: usuario.id });
  if (error) {
    if (/wms_transferir_danado|schema cache|Could not find the function/i.test(error.message)) return { error: "Falta correr en Supabase la migración 0372 (transferir dañados)." };
    return { error: error.message.length < 200 ? error.message : "No se pudo hacer el traslado." };
  }
  const nombre = (id: string) => (bodegas ?? []).find((b) => b.id === id)?.nombre ?? "otra bodega";
  const texto = `${r.cantidad.toLocaleString("es-PA")} ${r.cantidad === 1 ? "unidad dañada" : "unidades dañadas"} de ${maestro.codigo} de ${nombre(d.desde)} a ${nombre(r.hacia)}`;
  await registrarAuditoria({ accion: "transferir_defectuoso_inventario", entidad: "skus_maestros", entidadId: d.skuId, detalle: `${texto}${r.motivo ? ` (${r.motivo})` : ""}` });
  revalidatePath("/inventario");
  revalidatePath("/inventario/defectuosos");
  return { mensaje: `Listo: ${texto}.` };
}

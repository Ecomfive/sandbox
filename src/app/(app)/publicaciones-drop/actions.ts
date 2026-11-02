"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vincula una publicación de Drop con su producto de Producto (3 nov 2026): una persona confirma la sugerencia de la lectura (como en Gestión de IDs
 * Dropi, decisión de Alcides del 25 oct 2026: nada se vincula solo). Solo si todavía no está vinculada; queda en la auditoría.
 */
export async function vincularPublicacionDrop(id: string, skuId: string): Promise<{ ok: true; producto: { id: string; codigo: string; nombre: string } } | { error: string }> {
  await requireModuloEscritura("publicaciones-drop");
  if (typeof id !== "string" || !UUID.test(id) || typeof skuId !== "string" || !UUID.test(skuId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
  if (!sku) return { error: "Ese producto ya no existe." };
  const { data, error } = await supabase
    .from("drop_publicaciones")
    .update({ sku_maestro_id: sku.id, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .is("sku_maestro_id", null)
    .select("nombre, codigo")
    .maybeSingle();
  if (error) return { error: /drop_publicaciones|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 0221 (Gestión de IDs Drop) en la base." : "No se pudo vincular." };
  if (!data) return { error: "Esa publicación ya está vinculada o ya no existe. Recarga la página." };
  await registrarAuditoria({
    accion: "vincular_publicacion_drop",
    entidad: "drop_publicaciones",
    entidadId: id,
    detalle: `${data.nombre as string}${data.codigo ? ` (${data.codigo as string})` : ""} → ${sku.codigo as string} ${sku.nombre as string}`,
  });
  revalidatePath("/publicaciones-drop");
  return { ok: true, producto: { id: sku.id as string, codigo: sku.codigo as string, nombre: sku.nombre as string } };
}

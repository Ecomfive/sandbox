"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0263 (Dunamixfy) en la base.";

/** Vincula un producto de Dunamixfy con su producto de Producto, lo cambia o le quita el vínculo (`skuId` null). Siempre lo decide una persona, como en Dropi, Drop y Effi. */
export async function vincularPublicacionDunamixfy(
  id: string,
  skuId: string | null,
): Promise<{ ok: true; producto: { id: string; codigo: string; nombre: string } | null } | { error: string }> {
  await requireModuloEscritura("publicaciones-dunamixfy");
  if (typeof id !== "string" || !UUID.test(id) || (skuId !== null && (typeof skuId !== "string" || !UUID.test(skuId)))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("dunamixfy_publicaciones").select("nombre, dunamixfy_id, sku_maestro_id").eq("id", id).maybeSingle();
  if (errorAntes) return { error: /dunamixfy_publicaciones|schema cache|does not exist/i.test(errorAntes.message) ? FALTA : "No se pudo leer el producto." };
  if (!antes) return { error: "Ese producto ya no existe. Recarga la página." };
  let sku: { id: string; codigo: string; nombre: string } | null = null;
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe en Producto." };
    sku = { id: data.id as string, codigo: data.codigo as string, nombre: data.nombre as string };
  }
  if ((antes.sku_maestro_id ?? null) === (sku?.id ?? null)) return { ok: true, producto: sku };
  const { error } = await supabase.from("dunamixfy_publicaciones").update({ sku_maestro_id: sku?.id ?? null, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  const nombre = `${antes.nombre as string} (#${antes.dunamixfy_id as string})`;
  await registrarAuditoria({
    accion: sku ? "vincular_publicacion_dunamixfy" : "desvincular_publicacion_dunamixfy",
    entidad: "dunamixfy_publicaciones",
    entidadId: id,
    detalle: sku ? `${nombre} → ${sku.codigo} ${sku.nombre}` : `${nombre}: se quitó el vínculo con su producto`,
  });
  revalidatePath("/publicaciones-dunamixfy");
  revalidatePath("/inventario");
  return { ok: true, producto: sku };
}

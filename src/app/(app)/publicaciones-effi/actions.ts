"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { sincronizarEffi, type ResumenLecturaEffi } from "@/lib/effi/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0230 (Gestión de IDs Effi) en la base.";

/** Vincula un artículo de Effi con su producto, lo cambia o le quita el vínculo (`skuId` null). Siempre lo decide una persona, como en Dropi y Drop. */
export async function vincularPublicacionEffi(
  id: string,
  skuId: string | null,
): Promise<{ ok: true; producto: { id: string; codigo: string; nombre: string } | null } | { error: string }> {
  await requireModuloEscritura("publicaciones-effi");
  if (typeof id !== "string" || !UUID.test(id) || (skuId !== null && (typeof skuId !== "string" || !UUID.test(skuId)))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("effi_publicaciones").select("nombre, effi_id, sku_maestro_id").eq("id", id).maybeSingle();
  if (errorAntes) return { error: /effi_publicaciones|schema cache|does not exist/i.test(errorAntes.message) ? FALTA : "No se pudo leer el artículo." };
  if (!antes) return { error: "Ese artículo ya no existe. Recarga la página." };
  let sku: { id: string; codigo: string; nombre: string } | null = null;
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
    sku = { id: data.id as string, codigo: data.codigo as string, nombre: data.nombre as string };
  }
  if ((antes.sku_maestro_id ?? null) === (sku?.id ?? null)) return { ok: true, producto: sku };
  const { error } = await supabase.from("effi_publicaciones").update({ sku_maestro_id: sku?.id ?? null, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  const nombre = `${antes.nombre as string} (ID ${antes.effi_id as string})`;
  await registrarAuditoria({
    accion: sku ? "vincular_publicacion_effi" : "desvincular_publicacion_effi",
    entidad: "effi_publicaciones",
    entidadId: id,
    detalle: sku ? `${nombre} → ${sku.codigo} ${sku.nombre}` : `${nombre}: se quitó el vínculo con su producto`,
  });
  revalidatePath("/publicaciones-effi");
  return { ok: true, producto: sku };
}

/** «Actualizar desde Effi»: la misma lectura del cron. Solo consulta Effi y guarda aquí. */
export async function actualizarDesdeEffi(): Promise<{ resumen?: ResumenLecturaEffi; error?: string }> {
  await requireModuloEscritura("publicaciones-effi");
  try {
    const resumen = await sincronizarEffi(createServiceClient());
    revalidatePath("/publicaciones-effi");
    return { resumen };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo leer Effi.";
    return { error: /effi_publicaciones|schema cache|does not exist/i.test(mensaje) ? FALTA : mensaje };
  }
}

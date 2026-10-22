// La cola de cambios del sistema en Dropi (migración 0137): hoy, el nombre de un producto y el de su guía de envío, que deja «Usar
// este título» del Asistente de IA. Dropi rechaza (403) las llamadas que salen de un servidor, así que no se aplican desde aquí: los
// aplica el favorito «Aplicar en Dropi» desde la pestaña de Dropi (marcador-aplicar-dropi.ts) y la ventana que abre guarda el
// resultado (aplicar-actions.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_NOMBRE_DROPI } from "./dropi-guardado";
import { idsDeDropi } from "./sincronizar-dropi";

export type EstadoCambioDropi = "pendiente" | "aplicado" | "error" | "reemplazado";

/** El último cambio en Dropi de una publicación, para la ficha. */
export interface CambioDropiVista {
  id: string;
  estado: EstadoCambioDropi;
  nombre: string;
  nombreGuia: string | null;
  error: string | null;
  creadoEn: string;
  aplicadoEn: string | null;
}

/**
 * Deja en la cola el cambio de nombre de una publicación (reemplaza el que estuviera pendiente de la misma). Necesita un ID de Dropi;
 * con dos («8165/7409») va al primero. Devuelve el id del cambio, o un error (sin ID o sin la migración 0137).
 */
export async function encolarCambioNombre(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: { nombre: string; nombreGuia: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("publicacion_id", pub.id).in("estado", ["pendiente", "error"]);
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, nombre: cambio.nombre, nombre_guia: cambio.nombreGuia, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: /does not exist|schema cache/i.test(error?.message ?? "") ? "Falta correr en Supabase la migración 0137." : "No se pudo dejar el cambio para Dropi." };
  return { id: data.id as string };
}

/**
 * Un nombre nuevo, también para Dropi (pedido de Hernán, 22 oct 2026): «Nombre del producto» = el nombre y «Nombre del producto en
 * la guía de envío» = el código del SKU vinculado (lo que ve despacho). Queda pendiente y lo aplica el favorito «Aplicar en Dropi».
 * Lo usan «Usar este título» del Asistente de IA y la edición del nombre en la ficha.
 */
export async function enviarNombreADropi(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null; sku_maestro_id: string | null },
  nombre: string,
  por: { id: string; nombre: string },
): Promise<{ estado: "pendiente" | "error"; detalle: string }> {
  const { data: sku } = pub.sku_maestro_id ? await supabase.from("skus_maestros").select("codigo").eq("id", pub.sku_maestro_id).maybeSingle() : { data: null };
  const codigo = (sku?.codigo as string | undefined)?.trim() || null;
  const nombreGuia = codigo && codigo.length <= MAX_NOMBRE_DROPI ? codigo : null;
  const encolado = await encolarCambioNombre(supabase, pub, { nombre, nombreGuia }, por);
  if ("error" in encolado) return { estado: "error", detalle: encolado.error };
  return { estado: "pendiente", detalle: `Para Dropi${nombreGuia ? ` (guía: ${nombreGuia})` : ""}: pulsa «Aplicar en Dropi» con Dropi abierto.` };
}

/** El último cambio en Dropi de cada publicación del país y cuántos siguen pendientes. Sin la migración 0137, vacío. */
export async function cargarCambiosDropi(supabase: SupabaseClient, paisId: string): Promise<{ porPublicacion: Map<string, CambioDropiVista>; pendientes: number }> {
  const porPublicacion = new Map<string, CambioDropiVista>();
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, publicacion_id, estado, nombre, nombre_guia, error, creado_en, aplicado_en")
    .eq("pais_id", paisId)
    .neq("estado", "reemplazado")
    .order("creado_en", { ascending: false })
    .limit(2000);
  if (error) return { porPublicacion, pendientes: 0 };
  let pendientes = 0;
  for (const f of data ?? []) {
    if (f.estado === "pendiente") pendientes++;
    if (porPublicacion.has(f.publicacion_id as string)) continue;
    porPublicacion.set(f.publicacion_id as string, {
      id: f.id as string,
      estado: f.estado as EstadoCambioDropi,
      nombre: f.nombre as string,
      nombreGuia: (f.nombre_guia as string | null) ?? null,
      error: (f.error as string | null) ?? null,
      creadoEn: f.creado_en as string,
      aplicadoEn: (f.aplicado_en as string | null) ?? null,
    });
  }
  return { porPublicacion, pendientes };
}

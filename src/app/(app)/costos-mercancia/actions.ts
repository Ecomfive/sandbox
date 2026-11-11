"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { cerrarLotes, guardarLotes, guardarMapeo, validarLote, validarMapeo } from "@/lib/finanzas/guardar-costos";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import type { LoteCosto, MapeoDropi } from "@/lib/finanzas/costos-excel";
import { normalizar } from "@/lib/finanzas/clasificacion";

const MODULO = "costos-mercancia";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAVE = /^[0-9a-f]{24}#\d{1,5}$/;

/** Guarda un lote de filas de costo (≤ 400). */
export async function importarLotesCosto(archivo: string, filas: unknown[]): Promise<{ error: string } | { guardados: number; rechazados: number }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || !filas.length || filas.length > 400) return { error: "Lote inválido." };
    const buenos = filas.map(validarLote).filter((l): l is LoteCosto => l !== null);
    const guardados = await guardarLotes(createServiceClient(), origenDeArchivo(String(archivo ?? "")), buenos);
    return { guardados, rechazados: filas.length - buenos.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Cierra la importación: borra lotes de cada hoja que ya no están, guarda el mapeo y deja la auditoría. */
export async function terminarImportacionCostos(
  archivo: string,
  porHoja: Record<string, string[]>,
  mapeo: unknown[],
): Promise<{ error: string } | { borrados: number; mapeos: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const origen = origenDeArchivo(String(archivo ?? ""));
    const supabase = createServiceClient();
    let borrados = 0;
    let total = 0;
    for (const [hoja, claves] of Object.entries(porHoja ?? {}).slice(0, 10)) {
      const validas = new Set((Array.isArray(claves) ? claves : []).filter((c) => typeof c === "string" && CLAVE.test(c)));
      total += validas.size;
      if (validas.size) borrados += await cerrarLotes(supabase, origen, String(hoja).slice(0, 80), validas);
    }
    const filasMapeo = (Array.isArray(mapeo) ? mapeo : []).slice(0, 5000).map(validarMapeo).filter((m): m is MapeoDropi => m !== null);
    const mapeos = await guardarMapeo(supabase, filasMapeo);
    await registrarAuditoria({ accion: "importar_costos", entidad: "fin_costos_lotes", detalle: `${origen}: ${total} lotes, ${borrados} borrados, ${mapeos} mapeos` });
    revalidatePath("/costos-mercancia", "layout");
    return { borrados, mapeos };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

/** Une un nombre de Dropi con un producto de costo (o lo deja pendiente con `null`). */
export async function mapearProductoDropi(productoDropi: string, productoClave: string | null): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const dropi = String(productoDropi ?? "").trim().slice(0, 300);
    if (!dropi) return { error: "Producto inválido." };
    const clave = productoClave ? normalizar(String(productoClave)).slice(0, 300) : null;
    const supabase = createServiceClient();
    if (clave) {
      const { count } = await supabase.from("fin_costos_lotes").select("id", { count: "exact", head: true }).eq("producto_clave", clave);
      if (!count) return { error: "Ese producto no tiene costo cargado." };
    }
    const { error } = await supabase.from("fin_costos_mapeo").upsert(
      { producto_dropi: dropi, producto_dropi_clave: normalizar(dropi), producto_clave: clave, estado: clave ? "mapeado" : "pendiente", actualizado_en: new Date().toISOString() },
      { onConflict: "producto_dropi_clave" },
    );
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "mapear_costo", entidad: "fin_costos_lotes", detalle: `${dropi} → ${clave ?? "sin producto"}` });
    revalidatePath("/costos-mercancia/mapeo");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el mapeo." };
  }
}

/**
 * Pone el costo real en Productos y márgenes (`productos.costo`) para las filas marcadas. Pide además poder modificar
 * Productos y márgenes. Queda en la auditoría de cada producto con el costo de antes y el de ahora.
 */
export async function aplicarCostosAProductos(cambios: { id: string; costo: number }[]): Promise<{ error: string } | { aplicados: number }> {
  try {
    await requireModuloEscritura(MODULO);
    await requireModuloEscritura("productos");
    const limpios = (Array.isArray(cambios) ? cambios : [])
      .filter((c) => c && typeof c.id === "string" && UUID.test(c.id) && Number.isFinite(Number(c.costo)) && Number(c.costo) > 0 && Number(c.costo) < 100_000)
      .slice(0, 1000);
    if (!limpios.length) return { error: "Nada que aplicar." };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("productos").select("id, nombre, costo").in("id", limpios.map((c) => c.id));
    const previo = new Map((antes ?? []).map((p) => [p.id as string, p]));
    let aplicados = 0;
    const auditorias: Parameters<typeof registrarAuditoria>[0][] = [];
    for (const c of limpios) {
      const p = previo.get(c.id);
      if (!p) continue;
      const costo = Math.round(Number(c.costo) * 100) / 100;
      const { error } = await supabase.from("productos").update({ costo }).eq("id", c.id);
      if (error) return { error: error.message };
      aplicados++;
      auditorias.push({
        accion: "aplicar_costo_real",
        entidad: "productos",
        entidadId: c.id,
        detalle: String(p.nombre),
        antes: { Costo: p.costo === null ? "—" : String(p.costo) },
        despues: { Costo: String(costo) },
      });
    }
    await registrarAuditoriaLote(auditorias);
    revalidatePath("/costos-mercancia/mapeo");
    revalidatePath("/productos");
    revalidatePath("/estado-resultados");
    return { aplicados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron aplicar los costos." };
  }
}

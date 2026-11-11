"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import { TAMANO_LOTE_VENTAS, guardarLoteOrdenes, guardarMapeoProductos, validarMapeoProducto, validarOrden, type MapeoProducto, type ResultadoLoteVentas } from "@/lib/ventas/guardar";
import type { OrdenVenta } from "@/lib/ventas/matriz";

const MODULO = "ventas-tiendas";

/** Guarda un lote de órdenes (se llama varias veces, una por lote). */
export async function importarLoteVentas(
  archivo: string,
  ordenes: unknown[],
): Promise<{ error: string } | (ResultadoLoteVentas & { rechazadas: number })> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(ordenes) || ordenes.length === 0 || ordenes.length > TAMANO_LOTE_VENTAS) return { error: "Lote inválido." };
    const buenas: OrdenVenta[] = [];
    for (const o of ordenes) {
      const r = validarOrden(o);
      if (r.ok) buenas.push(r.orden);
    }
    const r = await guardarLoteOrdenes(createServiceClient(), origenDeArchivo(String(archivo ?? "")), buenas);
    return { ...r, rechazadas: ordenes.length - buenas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote." };
  }
}

/** Termina la importación: guarda el mapeo de productos y deja la auditoría. */
export async function terminarImportacionVentas(
  archivo: string,
  mapeo: unknown[],
  resumen: { ordenes: number; meses: string[] },
): Promise<{ error: string } | { mapeos: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const origen = origenDeArchivo(String(archivo ?? ""));
    const filas = (Array.isArray(mapeo) ? mapeo : []).slice(0, 10_000).map(validarMapeoProducto).filter((m): m is MapeoProducto => m !== null);
    const mapeos = await guardarMapeoProductos(createServiceClient(), origen, filas);
    const meses = Array.isArray(resumen?.meses) ? resumen.meses.filter((m) => typeof m === "string" && /^\d{4}-\d{2}$/.test(m)).slice(0, 36) : [];
    const ordenes = Number.isInteger(resumen?.ordenes) ? resumen.ordenes : 0;
    await registrarAuditoria({
      accion: "importar_ventas",
      entidad: "ven_ordenes",
      detalle: `${origen}: ${ordenes} órdenes (${meses.join(", ")}), ${mapeos} productos en el mapeo de costo`,
    });
    revalidatePath("/ventas-tiendas", "layout");
    return { mapeos };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

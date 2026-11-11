"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import {
  TAMANO_LOTE,
  guardarCobros,
  guardarLineas,
  guardarOrdenes,
  recalcularCuentaMes,
  validarCobro,
  validarLinea,
  validarOrden,
} from "@/lib/conciliacion/guardar";
import type { CobroLeido, FormatoHoja, LineaLeida, OrdenLeida } from "@/lib/conciliacion/leer-excel";

const MODULO = "conciliacion-bancaria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^\d{4}-\d{2}-01$/;
const FORMATOS = new Set<FormatoHoja>(["banco_general", "bac", "generico"]);

type Lote<T> = { error: string } | { guardados: number; rechazados: number } & T;

function validarTodos<T>(filas: unknown, validar: (v: unknown) => T | null): { buenos: T[]; rechazados: number } | null {
  if (!Array.isArray(filas) || !filas.length || filas.length > TAMANO_LOTE) return null;
  const buenos: T[] = [];
  for (const f of filas) {
    const v = validar(f);
    if (v) buenos.push(v);
  }
  return { buenos, rechazados: filas.length - buenos.length };
}

/** Guarda un lote de cobros de Yappy, MiPOS o Servientrega (se llama una vez por lote). */
export async function importarCobros(filas: unknown[]): Promise<Lote<object>> {
  try {
    await requireModuloEscritura(MODULO);
    const v = validarTodos<CobroLeido>(filas, validarCobro);
    if (!v) return { error: "Lote inválido." };
    await guardarCobros(createServiceClient(), v.buenos);
    return { guardados: v.buenos.length, rechazados: v.rechazados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote de cobros." };
  }
}

/** Guarda un lote de órdenes de tienda (las que trae el libro de conciliación). */
export async function importarOrdenes(filas: unknown[]): Promise<Lote<object>> {
  try {
    await requireModuloEscritura(MODULO);
    const v = validarTodos<OrdenLeida>(filas, validarOrden);
    if (!v) return { error: "Lote inválido." };
    await guardarOrdenes(createServiceClient(), v.buenos);
    return { guardados: v.buenos.length, rechazados: v.rechazados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote de órdenes." };
  }
}

/** Guarda un lote de líneas de un extracto en la cuenta elegida. */
export async function importarLineas(
  cuentaId: string,
  archivo: string,
  hoja: string,
  formato: string,
  filas: unknown[],
): Promise<Lote<{ nuevas: number }>> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof cuentaId !== "string" || !UUID.test(cuentaId)) return { error: "Elige la cuenta del extracto." };
    if (!FORMATOS.has(formato as FormatoHoja)) return { error: "Formato inválido." };
    const supabase = createServiceClient();
    const cuenta = await supabase.from("fin_cuentas").select("id").eq("id", cuentaId).maybeSingle();
    if (!cuenta.data) return { error: "La cuenta no existe." };
    const v = validarTodos<LineaLeida>(filas, validarLinea);
    if (!v) return { error: "Lote inválido." };
    const r = await guardarLineas(
      supabase,
      { cuentaId, archivo: origenDeArchivo(String(archivo ?? "")), hoja: String(hoja ?? "").slice(0, 60), formato: formato as FormatoHoja },
      v.buenos,
      usuario.id,
    );
    return { guardados: r.guardadas, nuevas: r.nuevas, rechazados: v.rechazados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote de líneas." };
  }
}

/**
 * Termina la importación: busca coincidencias en cada cuenta y mes que tocó el archivo (lo que tiene prueba queda
 * conciliado solo) y deja la auditoría.
 */
export async function terminarImportacion(
  archivo: string,
  tocados: { cuentaId: string; mes: string }[],
  resumen: { lineas: number; cobros: number; ordenes: number },
): Promise<{ error: string } | { auto: number; sugeridas: number; pendientes: number }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(tocados) || tocados.length > 120) return { error: "Demasiados meses." };
    const pares = [...new Map(tocados.filter((t) => t && UUID.test(String(t.cuentaId)) && MES.test(String(t.mes))).map((t) => [`${t.cuentaId}|${t.mes}`, t])).values()];
    const supabase = createServiceClient();
    let auto = 0;
    let sugeridas = 0;
    let pendientes = 0;
    for (const t of pares.sort((a, b) => a.mes.localeCompare(b.mes))) {
      const r = await recalcularCuentaMes(supabase, t.cuentaId, t.mes);
      auto += r.auto;
      sugeridas += r.sugeridas;
      pendientes += r.pendientes;
    }
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    await registrarAuditoria({
      accion: "importar_conciliacion",
      entidad: "conc_lineas",
      detalle: `${origenDeArchivo(String(archivo ?? ""))}: ${n(resumen?.lineas)} líneas, ${n(resumen?.cobros)} cobros, ${n(resumen?.ordenes)} órdenes · ${auto} conciliadas solas, ${sugeridas} sugeridas, ${pendientes} pendientes`,
    });
    revalidatePath("/conciliacion-bancaria", "layout");
    return { auto, sugeridas, pendientes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

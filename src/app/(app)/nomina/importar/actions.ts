"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import type { LineaExcel } from "@/lib/nomina/excel";
import {
  CLAVE_LINEA,
  TAMANO_LOTE,
  cerrarImportacionNomina,
  guardarLoteNomina,
  huellasDeOrigen,
  validarLinea,
  validarPeriodo,
  type ResultadoLote,
} from "@/lib/nomina/guardar";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "nomina";
const MAX_HUELLAS = 20_000;

const huellasValidas = (huellas: unknown): Set<string> | null =>
  Array.isArray(huellas) && huellas.length <= MAX_HUELLAS ? new Set(huellas.filter((h): h is string => typeof h === "string" && CLAVE_LINEA.test(h))) : null;

/** Qué va a pasar si se carga el archivo: cuántas líneas son nuevas, cuántas se actualizan y cuántas se borran. */
export async function resumirImportacionNomina(
  archivo: string,
  huellas: string[],
): Promise<{ error: string } | { nuevas: number; actualizan: number; borran: number; corregidas: number; origen: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const delArchivo = huellasValidas(huellas);
    if (!delArchivo) return { error: "El archivo trae demasiadas filas." };
    const origen = origenDeArchivo(String(archivo ?? ""));
    const enBase = await huellasDeOrigen(createServiceClient(), origen);
    let actualizan = 0;
    let corregidas = 0;
    for (const h of delArchivo) {
      const x = enBase.get(h);
      if (x?.editada) corregidas++;
      else if (x) actualizan++;
    }
    let borran = 0;
    for (const [h, x] of enBase) if (!delArchivo.has(h) && !x.editada) borran++;
    return { nuevas: delArchivo.size - actualizan - corregidas, actualizan, borran, corregidas, origen };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo revisar el archivo." };
  }
}

/** Guarda un lote de líneas (se llama una vez por lote). */
export async function importarLoteNomina(archivo: string, filas: unknown[]): Promise<{ error: string } | (ResultadoLote & { rechazadas: number })> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || filas.length === 0 || filas.length > TAMANO_LOTE) return { error: "Lote inválido." };
    const buenas: LineaExcel[] = [];
    let rechazadas = 0;
    for (const f of filas) {
      const r = validarLinea(f);
      if (r.ok) buenas.push(r.linea);
      else rechazadas++;
    }
    if (!buenas.length) return { guardados: 0, conservados: 0, personasNuevas: 0, tiendasNuevas: [], enMesCerrado: 0, rechazadas };
    const r = await guardarLoteNomina(createServiceClient(), origenDeArchivo(String(archivo ?? "")), buenas);
    return { ...r, rechazadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote." };
  }
}

/** Termina: borra lo de este archivo que ya no vino, guarda comisión y total de cada mes y deja la auditoría (sin montos). */
export async function terminarImportacionNomina(
  archivo: string,
  huellas: string[],
  periodos: unknown[],
  tipo: string,
): Promise<{ error: string } | { borrados: number; meses: number; enMesCerrado: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const delArchivo = huellasValidas(huellas);
    if (!delArchivo) return { error: "El archivo trae demasiadas filas." };
    // Sin huellas válidas no se borra nada: evita vaciar lo cargado por un envío roto.
    if (delArchivo.size === 0) return { error: "El archivo no trae líneas válidas." };
    const meses = (Array.isArray(periodos) ? periodos : []).slice(0, 60).map(validarPeriodo).filter((p) => p !== null);
    const origen = origenDeArchivo(String(archivo ?? ""));
    const r = await cerrarImportacionNomina(createServiceClient(), origen, delArchivo, meses);
    await registrarAuditoria({
      accion: "importar_nomina",
      entidad: "nom_lineas",
      detalle: `${origen} (${tipo === "externa" ? "externa" : "planilla formal"}): ${delArchivo.size} líneas de ${r.meses} meses, ${r.borrados} borradas${r.enMesCerrado ? `, ${r.enMesCerrado} de meses cerrados sin tocar` : ""}`,
    });
    revalidatePath("/nomina");
    revalidatePath("/nomina/conciliacion");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

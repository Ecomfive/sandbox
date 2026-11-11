"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import type { EntregaExcel } from "@/lib/deliverys/excel";
import {
  CLAVE_ENTREGA,
  TAMANO_LOTE,
  aplicarAsignaciones,
  cerrarImportacionEntregas,
  etiquetasSinDueno,
  guardarLoteEntregas,
  huellasDeOrigen,
  leerRepartidores,
  validarAsignaciones,
  validarEntregaExcel,
  type ResultadoLote,
} from "@/lib/deliverys/guardar";
import { claveEtiqueta } from "@/lib/deliverys/excel";
import { sugerirDueno } from "@/lib/deliverys/repartidor";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "deliverys";
const MAX_HUELLAS = 50_000;

const huellasValidas = (huellas: unknown): Set<string> | null =>
  Array.isArray(huellas) && huellas.length <= MAX_HUELLAS ? new Set(huellas.filter((h): h is string => typeof h === "string" && CLAVE_ENTREGA.test(h))) : null;

export interface ResumenImportacion {
  origen: string;
  nuevas: number;
  actualizan: number;
  borran: number;
  enCierre: number;
  /** Nombres de la hoja que no son de nadie, con la sugerencia de dueño (si hay una). */
  sinDueno: { etiqueta: string; sugerido: string | null }[];
  repartidores: { id: string; nombre: string }[];
}

/** Qué va a pasar si se carga el archivo, y qué nombres de la hoja hay que asignar a un repartidor. */
export async function resumirImportacionDeliverys(archivo: string, huellas: string[], etiquetas: string[]): Promise<{ error: string } | ResumenImportacion> {
  try {
    await requireModuloEscritura(MODULO);
    const delArchivo = huellasValidas(huellas);
    if (!delArchivo) return { error: "El archivo trae demasiadas filas." };
    if (!Array.isArray(etiquetas) || etiquetas.length > 500) return { error: "El archivo trae demasiados nombres." };
    const supabase = createServiceClient();
    const origen = origenDeArchivo(String(archivo ?? ""));
    const [enBase, repartidores] = await Promise.all([huellasDeOrigen(supabase, origen), leerRepartidores(supabase)]);
    let actualizan = 0;
    let enCierre = 0;
    for (const h of delArchivo) {
      const x = enBase.get(h);
      if (x?.enCierre) enCierre++;
      else if (x) actualizan++;
    }
    let borran = 0;
    for (const [h, x] of enBase) if (!delArchivo.has(h) && !x.enCierre) borran++;
    const limpias = etiquetas.filter((e): e is string => typeof e === "string").map(claveEtiqueta).filter(Boolean);
    return {
      origen,
      nuevas: delArchivo.size - actualizan - enCierre,
      actualizan,
      borran,
      enCierre,
      sinDueno: etiquetasSinDueno(limpias, repartidores).map((etiqueta) => ({ etiqueta, sugerido: sugerirDueno(etiqueta, repartidores) })),
      repartidores: repartidores.map((r) => ({ id: r.id, nombre: r.nombre })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo revisar el archivo." };
  }
}

/** Crea los repartidores nuevos y suma las zonas a quien se eligió. */
export async function asignarNombresDeliverys(asignaciones: unknown): Promise<{ error: string } | { creados: number; alias: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const a = validarAsignaciones(asignaciones);
    if (!a) return { error: "Asignaciones inválidas." };
    const r = await aplicarAsignaciones(createServiceClient(), a);
    if (r.creados || r.alias) {
      await registrarAuditoria({ accion: "asignar_repartidores_delivery", entidad: "del_repartidores", detalle: `${r.creados} repartidores nuevos, ${r.alias} zonas asignadas` });
    }
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron asignar los nombres." };
  }
}

/** Guarda un lote de líneas (se llama una vez por lote). */
export async function importarLoteDeliverys(archivo: string, filas: unknown[]): Promise<{ error: string } | (ResultadoLote & { rechazadas: number })> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || filas.length === 0 || filas.length > TAMANO_LOTE) return { error: "Lote inválido." };
    const buenas: EntregaExcel[] = [];
    let rechazadas = 0;
    for (const f of filas) {
      const r = validarEntregaExcel(f);
      if (r.ok) buenas.push(r.entrega);
      else rechazadas++;
    }
    if (!buenas.length) return { guardadas: 0, conservadas: 0, sinRepartidor: 0, sinTienda: 0, rechazadas };
    const r = await guardarLoteEntregas(createServiceClient(), origenDeArchivo(String(archivo ?? "")), buenas);
    return { ...r, rechazadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote." };
  }
}

/** Termina: borra lo de este archivo que ya no vino (nunca lo de una semana cerrada) y deja la auditoría (sin montos). */
export async function terminarImportacionDeliverys(archivo: string, huellas: string[], desde: unknown, hasta: unknown): Promise<{ error: string } | { borradas: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const delArchivo = huellasValidas(huellas);
    if (!delArchivo) return { error: "El archivo trae demasiadas filas." };
    // Sin huellas válidas no se borra nada: evita vaciar lo cargado por un envío roto.
    if (delArchivo.size === 0) return { error: "El archivo no trae líneas válidas." };
    const origen = origenDeArchivo(String(archivo ?? ""));
    const r = await cerrarImportacionEntregas(createServiceClient(), origen, delArchivo);
    const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "?");
    await registrarAuditoria({
      accion: "importar_deliverys",
      entidad: "del_entregas",
      detalle: `${origen}: ${delArchivo.size} líneas del ${fecha(desde)} al ${fecha(hasta)}, ${r.borradas} borradas`,
    });
    revalidatePath("/deliverys", "layout");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

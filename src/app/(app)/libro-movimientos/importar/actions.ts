"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import {
  TAMANO_LOTE,
  cerrarImportacion,
  guardarLoteMovimientos,
  huellasDeOrigen,
  origenDeArchivo,
  validarBase,
  validarMovimiento,
  type EntidadLibro,
  type ResultadoLote,
} from "@/lib/finanzas/guardar-libro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovimientoExcel } from "@/lib/finanzas/libro-excel";
import type { FilaComparable } from "@/lib/finanzas/comparar-libro";
import { traerTodasConError } from "@/lib/supabase/paginar";

const MODULO = "libro-movimientos";
const CLAVE = /^[0-9a-f]{24}#\d{1,5}$/;
const MAX_HUELLAS = 50_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La entidad del libro (migración 0923), leída de la base por su código: no se confía en lo que manda el navegador. Sin
 * código o con el de Panamá, null (el libro de siempre). Un código que no existe es un error.
 */
async function entidadDelLibro(supabase: SupabaseClient, codigo: unknown): Promise<EntidadLibro | null | { error: string }> {
  if (typeof codigo !== "string" || !codigo || codigo === "PA") return null;
  if (!/^[A-Z]{2}$/.test(codigo)) return { error: "Entidad inválida." };
  const { data, error } = await supabase.from("fin_entidades").select("id, codigo, moneda").eq("codigo", codigo).maybeSingle();
  if (error) return { error: "Falta correr la migración 0923 (multimoneda) en Supabase." };
  if (!data) return { error: "Entidad inválida." };
  return { id: data.id as string, codigo: data.codigo as string, moneda: data.moneda as string };
}

/** Qué va a pasar si se carga el archivo: cuántos movimientos son nuevos, cuántos se actualizan y cuántos se borran. */
export async function resumirImportacion(
  archivo: string,
  huellas: string[],
): Promise<{ error: string } | { nuevos: number; actualizan: number; borran: number; origen: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(huellas) || huellas.length > MAX_HUELLAS) return { error: "El archivo trae demasiadas filas." };
    const origen = origenDeArchivo(String(archivo ?? ""));
    const enBase = await huellasDeOrigen(createServiceClient(), origen);
    const delArchivo = new Set(huellas.filter((h) => typeof h === "string" && CLAVE.test(h)));
    let actualizan = 0;
    for (const h of delArchivo) if (enBase.has(h)) actualizan++;
    let borran = 0;
    for (const h of enBase.keys()) if (!delArchivo.has(h)) borran++;
    return { nuevos: delArchivo.size - actualizan, actualizan, borran, origen };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo revisar el archivo." };
  }
}

/** Guarda un lote de movimientos (se llama varias veces, una por lote). */
export async function importarLote(
  archivo: string,
  filas: unknown[],
  codigoEntidad?: string,
  importacionId?: string | null,
): Promise<{ error: string } | (ResultadoLote & { rechazados: number })> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || filas.length === 0 || filas.length > TAMANO_LOTE) return { error: "Lote inválido." };
    const supabase = createServiceClient();
    const entidad = await entidadDelLibro(supabase, codigoEntidad);
    if (entidad && "error" in entidad) return entidad;
    const buenos: MovimientoExcel[] = [];
    let rechazados = 0;
    for (const f of filas) {
      const r = validarMovimiento(f);
      if (r.ok) buenos.push(r.mov);
      else rechazados++;
    }
    if (!buenos.length) return { guardados: 0, conservados: 0, porRegla: 0, tiendasNuevas: [], cuentasNuevas: [], sinTipo: 0, enMesCerrado: 0, rechazados };
    const idImportacion = typeof importacionId === "string" && UUID.test(importacionId) ? importacionId : null;
    const r = await guardarLoteMovimientos(supabase, origenDeArchivo(String(archivo ?? "")), buenos, entidad, idImportacion);
    return { ...r, rechazados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote." };
  }
}

/** Termina la importación: borra lo de este archivo que ya no vino, guarda la base de reparto y deja la auditoría. */
export async function terminarImportacion(
  archivo: string,
  huellas: string[],
  base: unknown[],
  resumen: { movimientos: number; meses: string[] },
  codigoEntidad?: string,
): Promise<{ error: string } | { borrados: number; base: number; enMesCerrado: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const entidad = await entidadDelLibro(supabase, codigoEntidad);
    if (entidad && "error" in entidad) return entidad;
    if (!Array.isArray(huellas) || huellas.length > MAX_HUELLAS) return { error: "El archivo trae demasiadas filas." };
    const origen = origenDeArchivo(String(archivo ?? ""));
    const delArchivo = new Set(huellas.filter((h) => typeof h === "string" && CLAVE.test(h)));
    // Sin huellas válidas no se borra nada: evita vaciar lo cargado por un envío roto.
    if (delArchivo.size === 0) return { error: "El archivo no trae movimientos válidos." };
    const filasBase = (Array.isArray(base) ? base : []).slice(0, 5_000).map(validarBase).filter((b) => b !== null);
    const r = await cerrarImportacion(supabase, origen, delArchivo, filasBase, entidad);
    const meses = Array.isArray(resumen?.meses) ? resumen.meses.filter((m) => /^\d{4}-\d{2}$/.test(m)).slice(0, 24) : [];
    await registrarAuditoria({
      accion: "importar_libro",
      entidad: "fin_movimientos",
      detalle: `${origen}${entidad ? ` (${entidad.codigo}, ${entidad.moneda})` : ""}: ${delArchivo.size} movimientos (${meses.join(", ")}), ${r.borrados} borrados, ${r.base} filas de base de reparto${r.enMesCerrado ? `, ${r.enMesCerrado} de meses cerrados sin tocar` : ""}`,
    });
    revalidatePath("/libro-movimientos");
    revalidatePath("/estado-resultados");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar la importación." };
  }
}

interface FilaCargada {
  origen_clave: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_servicio: string | null;
  descripcion: string;
  monto: number | string;
  moneda?: string | null;
  monto_original?: number | string | null;
  tipo_texto: string | null;
  en_eerr: boolean;
  en_flujo: boolean;
  factura_numero: string | null;
  ruc_proveedor: string | null;
  editado_a_mano: boolean | null;
  fin_unidades: { nombre: string } | { nombre: string }[] | null;
  fin_tipos: { nombre: string } | { nombre: string }[] | null;
  fin_cuentas: { nombre: string } | { nombre: string }[] | null;
}

/**
 * Lo ya cargado de ese archivo, en la forma de `compararLibro` (nombres de tienda, tipo y cuenta), para comparar el Excel
 * nuevo antes de aplicarlo. Es una lectura, pero pide poder modificar el libro (es parte de importar).
 */
export async function leerCargadoDelArchivo(archivo: string): Promise<{ error: string } | { filas: FilaComparable[] }> {
  try {
    await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const origen = origenDeArchivo(String(archivo ?? ""));
    const r = await traerTodasConError<FilaCargada>((d, h) =>
      supabase
        .from("fin_movimientos")
        .select("origen_clave, periodo, fecha_pago, fecha_servicio, descripcion, monto, moneda, monto_original, tipo_texto, en_eerr, en_flujo, factura_numero, ruc_proveedor, editado_a_mano, fin_unidades(nombre), fin_tipos(nombre), fin_cuentas(nombre)")
        .eq("origen", origen)
        .order("id")
        .range(d, h) as unknown as PromiseLike<{ data: FilaCargada[] | null; error: unknown }>,
    );
    if (r.error) return { error: "No se pudo leer lo cargado." };
    const nombre = (v: FilaCargada["fin_unidades"]) => (Array.isArray(v) ? v[0]?.nombre : v?.nombre) ?? null;
    return {
      filas: (r.data ?? []).map((m) => ({
        clave: m.origen_clave,
        periodo: String(m.periodo).slice(0, 10),
        fecha_pago: m.fecha_pago,
        fecha_servicio: m.fecha_servicio,
        tienda: nombre(m.fin_unidades) ?? "",
        tipo: nombre(m.fin_tipos) ?? m.tipo_texto,
        descripcion: m.descripcion ?? "",
        // En otra moneda se compara lo que dice el Excel (el monto original), no los dólares.
        monto: m.moneda && m.moneda !== "USD" && m.monto_original !== null && m.monto_original !== undefined ? Number(m.monto_original) : Number(m.monto),
        cuenta: nombre(m.fin_cuentas),
        en_eerr: m.en_eerr,
        en_flujo: m.en_flujo,
        factura_numero: m.factura_numero,
        ruc_proveedor: m.ruc_proveedor,
        editado: m.editado_a_mano === true,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer lo cargado." };
  }
}

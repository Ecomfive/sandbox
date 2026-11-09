// Guarda en Supabase lo que se leyó de la hoja de deliverys (`excel.ts`). Lo usan la pantalla «Importar» (por lotes,
// desde Server Actions) y `scripts/finanzas/importar-deliverys.ts`. Recibe el cliente: no decide permisos.
// Las validaciones son puras y tienen prueba en `guardar.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveEtiqueta, TIENDAS_EXCEL, type EntregaExcel } from "./excel";
import { CATEGORIAS, ESTADOS, inicioSemana, type Categoria, type EstadoEntrega } from "./liquidacion";
import { claveRepartidor, resolverEtiqueta, type RepartidorAlias } from "./repartidor";

/** Líneas por lote: cada envío queda lejos del límite de 1 MB de una Server Action. */
export const TAMANO_LOTE = 400;
export const CLAVE_ENTREGA = /^[0-9a-f]{24}#\d{1,5}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const SIN_MIGRACION = "Falta correr la migración 0911 (Deliverys) en Supabase.";

/** Revisa una línea que llega del navegador: no se confía en nada de lo que mandó. */
export function validarEntregaExcel(v: unknown): { ok: true; entrega: EntregaExcel } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "fila vacía" };
  const e = v as Record<string, unknown>;
  if (typeof e.fecha !== "string" || !FECHA.test(e.fecha) || Number.isNaN(Date.parse(e.fecha))) return { ok: false, motivo: "fecha inválida" };
  const etiqueta = typeof e.etiqueta === "string" ? claveEtiqueta(e.etiqueta).slice(0, 80) : "";
  if (!etiqueta) return { ok: false, motivo: "sin repartidor" };
  const tienda = typeof e.tienda === "string" ? claveEtiqueta(e.tienda) : "";
  if (!(tienda in TIENDAS_EXCEL)) return { ok: false, motivo: "tienda desconocida" };
  const categoria = e.categoria === null ? null : (CATEGORIAS as readonly string[]).includes(e.categoria as string) ? (e.categoria as Categoria) : undefined;
  if (categoria === undefined) return { ok: false, motivo: "categoría inválida" };
  if (!(ESTADOS as readonly string[]).includes(e.estado as string)) return { ok: false, motivo: "estado inválido" };
  const estado = e.estado as EstadoEntrega;
  if (categoria === null && estado !== "devuelto" && estado !== "reprogramado") return { ok: false, motivo: "sin tarifa y no es devuelto" };
  const cantidad = e.cantidad;
  if (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10_000) return { ok: false, motivo: "cantidad inválida" };
  const tarifa = e.tarifa;
  if (typeof tarifa !== "number" || !Number.isFinite(tarifa) || tarifa < 0 || tarifa > 10_000) return { ok: false, motivo: "tarifa inválida" };
  if (categoria === "propina" && cantidad !== 1) return { ok: false, motivo: "propina con cantidad" };
  if (typeof e.origen_clave !== "string" || !CLAVE_ENTREGA.test(e.origen_clave)) return { ok: false, motivo: "huella inválida" };
  return {
    ok: true,
    entrega: {
      fila: Number.isInteger(e.fila) ? (e.fila as number) : 0,
      fecha: e.fecha,
      etiqueta,
      tienda,
      categoria,
      estado,
      cantidad,
      tarifa: categoria === null ? 0 : Math.round(tarifa * 100) / 100,
      origen_clave: e.origen_clave,
    },
  };
}

/** A quién va cada nombre de la hoja que todavía no es de nadie: a un repartidor existente (alias) o a uno nuevo. */
export interface Asignacion {
  etiqueta: string;
  /** null = crear un repartidor con ese nombre. */
  repartidorId: string | null;
}

export function validarAsignaciones(v: unknown): Asignacion[] | null {
  if (!Array.isArray(v) || v.length > 200) return null;
  const r: Asignacion[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") return null;
    const x = a as Record<string, unknown>;
    const etiqueta = typeof x.etiqueta === "string" ? claveEtiqueta(x.etiqueta).slice(0, 80) : "";
    if (!etiqueta) return null;
    if (x.repartidorId !== null && (typeof x.repartidorId !== "string" || !UUID.test(x.repartidorId))) return null;
    r.push({ etiqueta, repartidorId: x.repartidorId as string | null });
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// Lectura de catálogos
// ---------------------------------------------------------------------------------------------

export async function leerRepartidores(supabase: SupabaseClient): Promise<(RepartidorAlias & { nombre: string; activo: boolean })[]> {
  const { data, error } = await supabase.from("del_repartidores").select("id, clave, nombre, alias, activo").order("nombre");
  if (error) throw new Error(SIN_MIGRACION);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    clave: r.clave as string,
    nombre: r.nombre as string,
    alias: (r.alias as string[] | null) ?? [],
    activo: r.activo !== false,
  }));
}

export async function leerTiendas(supabase: SupabaseClient): Promise<Map<string, { unidadId: string; pagoAparte: boolean }>> {
  const { data, error } = await supabase.from("del_tiendas").select("unidad_id, etiqueta, pago_aparte");
  if (error) throw new Error(SIN_MIGRACION);
  return new Map((data ?? []).map((t) => [t.etiqueta as string, { unidadId: t.unidad_id as string, pagoAparte: Boolean(t.pago_aparte) }]));
}

/** Los nombres de la hoja que todavía no son de ningún repartidor. */
export function etiquetasSinDueno(etiquetas: string[], repartidores: RepartidorAlias[]): string[] {
  return [...new Set(etiquetas.map(claveEtiqueta))].filter((e) => e && !resolverEtiqueta(e, repartidores)).sort();
}

/**
 * Aplica las asignaciones: suma el nombre a los alias del repartidor elegido o crea uno nuevo. Devuelve cuántos se
 * crearon. Se puede repetir: lo que ya está asignado no cambia.
 */
export async function aplicarAsignaciones(supabase: SupabaseClient, asignaciones: Asignacion[]): Promise<{ creados: number; alias: number }> {
  const repartidores = await leerRepartidores(supabase);
  let creados = 0;
  let alias = 0;
  const ahora = new Date().toISOString();
  for (const a of asignaciones) {
    if (resolverEtiqueta(a.etiqueta, repartidores)) continue;
    if (a.repartidorId === null) {
      const clave = claveRepartidor(a.etiqueta);
      const { data, error } = await supabase
        .from("del_repartidores")
        .upsert({ clave, nombre: a.etiqueta, actualizado_en: ahora }, { onConflict: "clave", ignoreDuplicates: true })
        .select("id, clave, nombre, alias, activo");
      if (error) throw new Error(`del_repartidores: ${error.message}`);
      if (data?.length) {
        creados++;
        repartidores.push({ id: data[0].id as string, clave, nombre: a.etiqueta, alias: [], activo: true });
      }
      continue;
    }
    const r = repartidores.find((x) => x.id === a.repartidorId);
    if (!r) throw new Error("Ese repartidor ya no existe.");
    r.alias = [...new Set([...r.alias, a.etiqueta])];
    const { error } = await supabase.from("del_repartidores").update({ alias: r.alias, actualizado_en: ahora }).eq("id", r.id);
    if (error) throw new Error(`del_repartidores: ${error.message}`);
    alias++;
  }
  return { creados, alias };
}

// ---------------------------------------------------------------------------------------------
// Escritura de las entregas
// ---------------------------------------------------------------------------------------------

export interface ResultadoLote {
  guardadas: number;
  /** Líneas de una semana ya cerrada o pagada: no se tocan. */
  conservadas: number;
  /** Nombres de la hoja sin repartidor o tiendas sin configurar. */
  sinRepartidor: number;
  sinTienda: number;
}

/** Semanas cerradas o pagadas (repartidor|semana): ni se agregan ni se cambian líneas en ellas. */
async function semanasCerradas(supabase: SupabaseClient, semanas: string[]): Promise<Set<string>> {
  const r = new Set<string>();
  if (!semanas.length) return r;
  const { data, error } = await supabase.from("del_cierres").select("repartidor_id, semana").in("semana", semanas).neq("estado", "abierto");
  if (error) throw new Error(`del_cierres: ${error.message}`);
  for (const c of data ?? []) r.add(`${c.repartidor_id}|${String(c.semana).slice(0, 10)}`);
  return r;
}

export async function guardarLoteEntregas(supabase: SupabaseClient, origen: string, entregas: EntregaExcel[]): Promise<ResultadoLote> {
  const [repartidores, tiendas] = await Promise.all([leerRepartidores(supabase), leerTiendas(supabase)]);
  const cerradas = await semanasCerradas(supabase, [...new Set(entregas.map((e) => inicioSemana(e.fecha)))]);
  let sinRepartidor = 0;
  let sinTienda = 0;
  let conservadas = 0;
  const ahora = new Date().toISOString();
  const filas: Record<string, unknown>[] = [];
  for (const e of entregas) {
    const r = resolverEtiqueta(e.etiqueta, repartidores);
    if (!r) {
      sinRepartidor++;
      continue;
    }
    const t = tiendas.get(e.tienda);
    if (!t) {
      sinTienda++;
      continue;
    }
    if (cerradas.has(`${r.repartidorId}|${inicioSemana(e.fecha)}`)) {
      conservadas++;
      continue;
    }
    filas.push({
      fecha: e.fecha,
      repartidor_id: r.repartidorId,
      etiqueta: e.etiqueta,
      zona: r.zona,
      unidad_id: t.unidadId,
      categoria: e.categoria,
      estado: e.estado,
      cantidad: e.cantidad,
      tarifa: e.tarifa,
      origen,
      origen_clave: e.origen_clave,
      actualizado_en: ahora,
    });
  }
  // Una línea ya ligada a un cierre (porque se cerró y se volvió a abrir) tampoco se pisa.
  const ligadas = new Set<string>();
  const claves = filas.map((f) => f.origen_clave as string);
  for (let i = 0; i < claves.length; i += 200) {
    const { data, error } = await supabase.from("del_entregas").select("origen_clave").not("cierre_id", "is", null).in("origen_clave", claves.slice(i, i + 200));
    if (error) throw new Error(`del_entregas: ${error.message}`);
    for (const x of data ?? []) ligadas.add(x.origen_clave as string);
  }
  const aGuardar = filas.filter((f) => !ligadas.has(f.origen_clave as string));
  conservadas += filas.length - aGuardar.length;
  if (aGuardar.length) {
    const { error } = await supabase.from("del_entregas").upsert(aGuardar, { onConflict: "origen_clave" });
    if (error) throw new Error(`del_entregas: ${error.message}`);
  }
  return { guardadas: aGuardar.length, conservadas, sinRepartidor, sinTienda };
}

/** Huellas de lo ya cargado de ese archivo, con si está en un cierre (entonces no se borra ni se pisa). */
export async function huellasDeOrigen(supabase: SupabaseClient, origen: string): Promise<Map<string, { id: string; enCierre: boolean }>> {
  const r = new Map<string, { id: string; enCierre: boolean }>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("del_entregas")
      .select("id, origen_clave, cierre_id")
      .eq("origen", origen)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(SIN_MIGRACION);
    for (const x of data ?? []) if (x.origen_clave) r.set(x.origen_clave as string, { id: x.id as string, enCierre: x.cierre_id !== null });
    if (!data || data.length < 1000) break;
  }
  return r;
}

/** Borra lo de ese mismo archivo que ya no vino (nunca lo que está en un cierre ni lo de otro archivo o cargado a mano). */
export async function cerrarImportacionEntregas(supabase: SupabaseClient, origen: string, delArchivo: Set<string>): Promise<{ borradas: number }> {
  const enBase = await huellasDeOrigen(supabase, origen);
  const sobran = [...enBase].filter(([k, x]) => !delArchivo.has(k) && !x.enCierre).map(([, x]) => x.id);
  for (let i = 0; i < sobran.length; i += 200) {
    const { error } = await supabase.from("del_entregas").delete().in("id", sobran.slice(i, i + 200)).is("cierre_id", null);
    if (error) throw new Error(error.message);
  }
  return { borradas: sobran.length };
}

// Guarda en Supabase las cuentas por cobrar o por pagar leídas del Excel (ver `cxc-cxp-excel.ts`). Lo usan la pantalla
// «Importar Excel» de cada cartera (en lotes, desde Server Actions) y `scripts/finanzas/importar-cartera.ts`. Recibe el
// cliente de Supabase: no decide permisos (eso lo hace quien lo llama).
//
// Reglas al reimportar:
//  - Cada documento y cada abono tienen su huella (`origen_clave`): lo que ya estaba se actualiza, no se duplica.
//  - Nunca se tocan el vencimiento, las notas del portal ni el estado marcado a mano (incobrable/anulado); la tienda
//    tampoco si se cambió en el portal (`editado_a_mano`).
//  - Los abonos del Excel de un documento se reemplazan por los que trae el archivo; los registrados en el portal quedan.
//  - Un documento que ya no está en la hoja se borra solo si vino de esa misma hoja y nadie lo tocó en el portal (sin
//    abonos del portal, sin estado a mano y sin editar); si no, se conserva y se cuenta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveCatalogo } from "./libro-excel";
import { CLAVE_IMPORTACION, type Clase, type DocumentoImportado } from "./cxc-cxp";

export const MAX_DOCUMENTOS_ARCHIVO = 20_000;

/** Las hojas que llegan del navegador: texto corto, sin repetir. */
export function validarHojas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((h): h is string => typeof h === "string").map((h) => h.replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
}

export function validarClaves(v: unknown): Set<string> {
  if (!Array.isArray(v) || v.length > MAX_DOCUMENTOS_ARCHIVO) return new Set();
  return new Set(v.filter((h): h is string => typeof h === "string" && CLAVE_IMPORTACION.test(h)));
}

export function archivoDeNombre(nombre: string): string {
  const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\- ()]/g, "").slice(0, 120) || "excel";
}

interface Existente {
  id: string;
  origen_clave: string;
  /** Tocado en el portal: no se borra al reimportar. */
  protegido: boolean;
  editado: boolean;
}

/** Lo que ya está cargado de esas hojas (para el resumen previo y para borrar lo que ya no vino). */
export async function existentesDeHojas(supabase: SupabaseClient, clase: Clase, hojas: string[]): Promise<Map<string, Existente>> {
  const mapa = new Map<string, Existente>();
  if (!hojas.length) return mapa;
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("fin_cartera")
      .select("id, origen_clave, estado_manual, editado_a_mano, fin_cartera_abonos(origen)")
      .eq("clase", clase)
      .eq("origen", "excel")
      .in("origen_hoja", hojas)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; origen_clave: string | null; estado_manual: string | null; editado_a_mano: boolean; fin_cartera_abonos: { origen: string }[] | null }[]) {
      if (!r.origen_clave) continue;
      const abonoManual = (r.fin_cartera_abonos ?? []).some((a) => a.origen === "manual");
      mapa.set(r.origen_clave, { id: r.id, origen_clave: r.origen_clave, protegido: !!r.estado_manual || r.editado_a_mano || abonoManual, editado: r.editado_a_mano });
    }
    if (!data || data.length < 1000) break;
  }
  return mapa;
}

export interface ResumenImportacion {
  nuevos: number;
  actualizan: number;
  borran: number;
  /** Ya no están en la hoja pero se tocaron en el portal: se dejan. */
  conservan: number;
}

export function resumirContra(existentes: Map<string, Existente>, claves: Set<string>): ResumenImportacion {
  let actualizan = 0;
  for (const k of claves) if (existentes.has(k)) actualizan++;
  let borran = 0;
  let conservan = 0;
  for (const [k, e] of existentes) {
    if (claves.has(k)) continue;
    if (e.protegido) conservan++;
    else borran++;
  }
  return { nuevos: claves.size - actualizan, actualizan, borran, conservan };
}

async function idsPorClave(supabase: SupabaseClient, claves: string[]): Promise<Map<string, { id: string; editado: boolean }>> {
  const mapa = new Map<string, { id: string; editado: boolean }>();
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("fin_cartera").select("id, origen_clave, editado_a_mano").in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) mapa.set(r.origen_clave as string, { id: r.id as string, editado: r.editado_a_mano === true });
  }
  return mapa;
}

export interface ResultadoLoteCartera {
  guardados: number;
  abonos: number;
  /** Tiendas que el Excel nombra y no están en el catálogo: el documento queda sin tienda. */
  tiendasDesconocidas: string[];
}

/** Crea o actualiza (por huella) un lote de documentos con sus abonos. */
export async function guardarLoteCartera(
  supabase: SupabaseClient,
  clase: Clase,
  archivo: string,
  docs: DocumentoImportado[],
): Promise<ResultadoLoteCartera> {
  if (!docs.length) return { guardados: 0, abonos: 0, tiendasDesconocidas: [] };
  const { data: unidadesData, error: eu } = await supabase.from("fin_unidades").select("id, nombre");
  if (eu) throw new Error(`fin_unidades: ${eu.message}`);
  const unidades = new Map((unidadesData ?? []).map((u) => [claveCatalogo(u.nombre as string), u.id as string]));
  const desconocidas = new Set<string>();
  const previos = await idsPorClave(supabase, docs.map((d) => d.origen_clave));
  const ahora = new Date().toISOString();

  const fila = (d: DocumentoImportado, conTienda: boolean) => {
    const unidadId = d.unidad ? (unidades.get(claveCatalogo(d.unidad)) ?? null) : null;
    if (d.unidad && !unidadId) desconocidas.add(d.unidad);
    return {
      clase,
      contraparte: d.contraparte,
      ...(conTienda ? { unidad_id: unidadId } : {}),
      documento: d.documento,
      fecha: d.fecha,
      motivo: d.motivo,
      monto: d.monto,
      notas_excel: d.notas_excel,
      origen: "excel",
      origen_archivo: archivo,
      origen_hoja: d.hoja,
      origen_clave: d.origen_clave,
      actualizado_en: ahora,
    };
  };
  // La tienda cambiada en el portal no se pisa: esos van en una escritura aparte, sin `unidad_id`.
  const editados = docs.filter((d) => previos.get(d.origen_clave)?.editado);
  const resto = docs.filter((d) => !previos.get(d.origen_clave)?.editado);
  const ids = new Map<string, string>();
  for (const [grupo, conTienda] of [
    [resto, true],
    [editados, false],
  ] as const) {
    if (!grupo.length) continue;
    const { data, error } = await supabase
      .from("fin_cartera")
      .upsert(grupo.map((d) => fila(d, conTienda)), { onConflict: "origen_clave" })
      .select("id, origen_clave");
    if (error) throw new Error(`fin_cartera: ${error.message}`);
    for (const r of data ?? []) ids.set(r.origen_clave as string, r.id as string);
  }

  // Abonos del Excel: se guardan los que vienen y se borran los del Excel que ya no vienen (los del portal se quedan).
  const abonos = docs.flatMap((d) =>
    d.abonos.map((a) => ({
      documento_id: ids.get(d.origen_clave)!,
      fecha: a.fecha,
      monto: a.monto,
      metodo: a.metodo,
      referencia: a.referencia,
      origen: "excel",
      origen_clave: a.origen_clave,
    })),
  ).filter((a) => a.documento_id);
  if (abonos.length) {
    const { error } = await supabase.from("fin_cartera_abonos").upsert(abonos, { onConflict: "origen_clave" });
    if (error) throw new Error(`fin_cartera_abonos: ${error.message}`);
  }
  const clavesAbonos = new Set(abonos.map((a) => a.origen_clave));
  const idsDocs = [...ids.values()];
  for (let i = 0; i < idsDocs.length; i += 100) {
    const { data, error } = await supabase
      .from("fin_cartera_abonos")
      .select("id, origen_clave")
      .eq("origen", "excel")
      .in("documento_id", idsDocs.slice(i, i + 100));
    if (error) throw new Error(error.message);
    const sobran = (data ?? []).filter((a) => !clavesAbonos.has(a.origen_clave as string)).map((a) => a.id as string);
    if (sobran.length) {
      const { error: ed } = await supabase.from("fin_cartera_abonos").delete().in("id", sobran);
      if (ed) throw new Error(ed.message);
    }
  }
  return { guardados: ids.size, abonos: abonos.length, tiendasDesconocidas: [...desconocidas] };
}

/** Cierra una importación: borra lo de esas hojas que ya no vino y nadie tocó en el portal. */
export async function cerrarImportacionCartera(
  supabase: SupabaseClient,
  clase: Clase,
  hojas: string[],
  claves: Set<string>,
): Promise<{ borrados: number; conservados: number }> {
  const existentes = await existentesDeHojas(supabase, clase, hojas);
  const sobran = [...existentes.values()].filter((e) => !claves.has(e.origen_clave));
  const borrar = sobran.filter((e) => !e.protegido).map((e) => e.id);
  for (let i = 0; i < borrar.length; i += 200) {
    const { error } = await supabase.from("fin_cartera").delete().in("id", borrar.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return { borrados: borrar.length, conservados: sobran.length - borrar.length };
}

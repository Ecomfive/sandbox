// Lecturas de «Datos y calidad» del libro: proveedores (catálogo y alias), revisiones guardadas, duplicados y atípicos.
// Solo lectura; los permisos los decide quien llama. Sin la migración 0925 todo devuelve vacío con `falta: true`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { detectarAtipicos, posiblesDuplicados, type Atipico, type ParDuplicado } from "./duplicados";
import { armarCatalogo, proveedorDe, type CatalogoProveedores } from "./proveedores";

export interface Proveedor {
  id: string;
  nombre: string;
  ruc: string | null;
  dv: string | null;
  activo: boolean;
}

export interface AliasProveedor {
  id: string;
  proveedor_id: string;
  alias: string;
}

/** El catálogo de proveedores. `falta` = sin la migración 0925. */
export async function leerProveedores(supabase: SupabaseClient): Promise<{ falta: boolean; proveedores: Proveedor[]; alias: AliasProveedor[]; catalogo: CatalogoProveedores }> {
  const [p, a] = await Promise.all([
    supabase.from("fin_proveedores").select("id, nombre, ruc, dv, activo").order("nombre"),
    supabase.from("fin_proveedor_alias").select("id, proveedor_id, alias").order("alias"),
  ]);
  if (p.error || a.error) return { falta: true, proveedores: [], alias: [], catalogo: armarCatalogo([], []) };
  const proveedores = (p.data ?? []) as Proveedor[];
  const alias = (a.data ?? []) as AliasProveedor[];
  return { falta: false, proveedores, alias, catalogo: armarCatalogo(proveedores.filter((x) => x.activo), alias) };
}

/** Las claves revisadas («dup:a|b», «atip:id»). */
export async function leerRevisados(supabase: SupabaseClient): Promise<{ falta: boolean; claves: Set<string> }> {
  const r = await traerTodasConError<{ clave: string }>((d, h) => supabase.from("fin_calidad_revisados").select("clave").order("clave").range(d, h));
  return r.error ? { falta: true, claves: new Set() } : { falta: false, claves: new Set((r.data ?? []).map((x) => x.clave)) };
}

export interface MovCalidad {
  id: string;
  periodo: string;
  fecha: string;
  fecha_pago: string | null;
  descripcion: string;
  monto: number;
  tipo_id: string | null;
  unidad_id: string;
  ruc_proveedor: string | null;
  origen: string;
  anulado: boolean;
  editado: boolean;
  proveedor_id: string | null;
}

interface FilaMov {
  id: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_registro: string | null;
  descripcion: string;
  monto: number | string;
  tipo_id: string | null;
  unidad_id: string;
  ruc_proveedor: string | null;
  origen: string;
  en_eerr: boolean;
  en_flujo: boolean;
  editado_a_mano: boolean | null;
  anulado_en?: string | null;
}

/**
 * Los movimientos desde `desde` (AAAA-MM-01) con lo que necesitan duplicados, atípicos y proveedores. Con la migración
 * 0138 trae también si está anulado; sin ella, se lee sin esa columna.
 */
/** `unidades`: las tiendas permitidas de la persona (mejora 99); null = todas. */
export async function leerMovimientosCalidad(
  supabase: SupabaseClient,
  desde: string | null,
  catalogo: CatalogoProveedores,
  unidades: string[] | null = null,
): Promise<{ error: string } | MovCalidad[]> {
  const columnas = "id, periodo, fecha_pago, fecha_registro, descripcion, monto, tipo_id, unidad_id, ruc_proveedor, origen, en_eerr, en_flujo, editado_a_mano";
  const leer = (cols: string) =>
    traerTodasConError<FilaMov>((d, h) => {
      let q = supabase.from("fin_movimientos").select(cols);
      if (desde) q = q.gte("periodo", desde);
      if (unidades) q = q.in("unidad_id", unidades.length ? unidades : ["00000000-0000-0000-0000-000000000000"]);
      return q.order("periodo").order("id").range(d, h) as unknown as PromiseLike<{ data: FilaMov[] | null; error: unknown }>;
    });
  let r = await leer(`${columnas}, anulado_en`);
  if (r.error) r = await leer(columnas);
  if (r.error) return { error: "No se pudieron leer los movimientos." };
  return (r.data ?? []).map((m) => {
    const periodo = String(m.periodo).slice(0, 10);
    return {
      id: m.id,
      periodo,
      fecha: m.fecha_pago ?? m.fecha_registro ?? periodo,
      fecha_pago: m.fecha_pago,
      descripcion: m.descripcion ?? "",
      monto: Number(m.monto),
      tipo_id: m.tipo_id,
      unidad_id: m.unidad_id,
      ruc_proveedor: m.ruc_proveedor,
      origen: m.origen,
      anulado: !!m.anulado_en,
      editado: m.editado_a_mano === true,
      proveedor_id: proveedorDe({ descripcion: m.descripcion ?? "", ruc: m.ruc_proveedor }, catalogo),
    };
  });
}

export interface Calidad {
  falta: boolean;
  movimientos: MovCalidad[];
  duplicados: ParDuplicado[];
  atipicos: Map<string, Atipico>;
  /** Los atípicos que nadie marcó como revisados. */
  atipicosPendientes: Atipico[];
  proveedores: Proveedor[];
  alias: AliasProveedor[];
  catalogo: CatalogoProveedores;
}

/** Duplicados (sin los anulados ni los marcados «no es duplicado») y atípicos de los últimos meses. */
export async function cargarCalidad(supabase: SupabaseClient, desde: string | null, unidades: string[] | null = null): Promise<{ error: string } | Calidad> {
  const [prov, rev] = await Promise.all([leerProveedores(supabase), leerRevisados(supabase)]);
  const movs = await leerMovimientosCalidad(supabase, desde, prov.catalogo, unidades);
  if ("error" in movs) return movs;
  const vivos = movs.filter((m) => !m.anulado);
  const descartados = new Set([...rev.claves].filter((c) => c.startsWith("dup:")).map((c) => c.slice(4)));
  const duplicados = posiblesDuplicados(
    vivos.map((m) => ({ id: m.id, fecha: m.fecha, monto: m.monto, descripcion: m.descripcion, proveedor: m.proveedor_id })),
    { descartados },
  );
  const atipicos = detectarAtipicos(vivos.map((m) => ({ id: m.id, tipo_id: m.tipo_id, periodo: m.periodo, monto: m.monto })));
  const atipicosPendientes = [...atipicos.values()].filter((a) => !rev.claves.has(`atip:${a.id}`));
  return { falta: prov.falta || rev.falta, movimientos: movs, duplicados, atipicos, atipicosPendientes, proveedores: prov.proveedores, alias: prov.alias, catalogo: prov.catalogo };
}

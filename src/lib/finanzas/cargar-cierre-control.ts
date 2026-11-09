// Lectura de Supabase para Cierre y control (migración 0927): los ajustes del cierre, lo que miran las tareas nuevas del
// checklist (devengos, provisiones, cuadres y variaciones), los asientos de ajuste, los prepagos, los cuadres y las
// reaperturas. Solo lectura; los permisos los decide quien llama. Sin la migración, cada lectura devuelve null o un error
// corto y lo demás sigue.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarEerr } from "./cargar-eerr";
import { armarEerr } from "./eerr";
import {
  CONFIG_CIERRE_DEFECTO,
  leerConfigCierre,
  leerPartesDropi,
  lineasVariacion,
  resumenVariaciones,
  type ClaseCuadre,
  type ConfigCierre,
  type CuadreGuardado,
  type LineaVariacion,
  type PartesDropi,
} from "./cierre-control";
import { lineasDevengoDelMes, type Prepago } from "./devengos";
import { CLAVES_PROVISION } from "./provisiones";
import type { ClaseAjuste, OrigenAjuste } from "./ajustes-cierre";

export const SIN_MIGRACION_CONTROL = "Falta correr la migración 0927 (cierre y control) en Supabase.";

const mes = (v: unknown) => String(v).slice(0, 10);

function mesAnteriorDe(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
}

function rango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let m = desde; m <= hasta && out.length < 240; ) {
    out.push(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01-01` : `${a}-${String(mm + 1).padStart(2, "0")}-01`;
  }
  return out;
}

/** Los ajustes del cierre (`fin_config.cierre`); sin fila o sin la tabla, los de por defecto. */
export async function cargarConfigCierre(supabase: SupabaseClient): Promise<{ config: ConfigCierre; guardada: boolean }> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", "cierre").maybeSingle();
  if (error || !data) return { config: CONFIG_CIERRE_DEFECTO, guardada: false };
  return { config: leerConfigCierre(data.valor), guardada: true };
}

// ---------------------------------------------------------------------------------------------
// Prepagos y asientos de ajuste
// ---------------------------------------------------------------------------------------------
export interface PrepagoGuardado extends Prepago {
  unidadId: string;
  tipoId: string;
  notas: string | null;
}

export async function cargarPrepagos(supabase: SupabaseClient, soloActivos = false): Promise<{ error: string } | PrepagoGuardado[]> {
  let q = supabase
    .from("fin_prepagos")
    .select("id, concepto, unidad_id, tipo_id, monto, desde, meses, periodo_pago, pago_en_eerr, notas, activo")
    .order("desde", { ascending: false })
    .limit(500);
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) return { error: SIN_MIGRACION_CONTROL };
  return (data ?? []).map((p) => ({
    id: p.id as string,
    concepto: p.concepto as string,
    unidadId: p.unidad_id as string,
    tipoId: p.tipo_id as string,
    monto: Number(p.monto),
    desde: mes(p.desde),
    meses: Number(p.meses),
    periodoPago: p.periodo_pago ? mes(p.periodo_pago) : null,
    pagoEnEerr: Boolean(p.pago_en_eerr),
    notas: (p.notas as string | null) ?? null,
    activo: Boolean(p.activo),
  }));
}

export interface AjusteGuardado {
  id: string;
  periodo: string;
  clase: ClaseAjuste;
  concepto: string;
  origen: OrigenAjuste;
  origenRef: string | null;
  efecto: number;
  notas: string | null;
  creadoEn: string;
  creadoPor: string | null;
  lineas: { unidad: string; tipo: string; monto: number }[];
}

/** Los asientos de ajuste de un mes con sus líneas del libro. */
export async function cargarAjustesMes(supabase: SupabaseClient, periodo: string): Promise<{ error: string } | AjusteGuardado[]> {
  const { data, error } = await supabase
    .from("fin_ajustes_cierre")
    .select("id, periodo, clase, concepto, origen, origen_ref, efecto, notas, creado_en, creado_por")
    .eq("periodo", periodo)
    .order("creado_en");
  if (error) return { error: SIN_MIGRACION_CONTROL };
  const ids = (data ?? []).map((a) => a.id as string);
  const lineas = ids.length
    ? await supabase.from("fin_movimientos").select("ajuste_id, monto, fin_unidades(nombre), fin_tipos(nombre)").in("ajuste_id", ids)
    : { data: [], error: null };
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const porAjuste = new Map<string, AjusteGuardado["lineas"]>();
  for (const l of (lineas.data ?? []) as { ajuste_id: string; monto: number | string; fin_unidades: unknown; fin_tipos: unknown }[]) {
    const lista = porAjuste.get(l.ajuste_id) ?? [];
    lista.push({
      unidad: uno(l.fin_unidades as { nombre: string } | null)?.nombre ?? "—",
      tipo: uno(l.fin_tipos as { nombre: string } | null)?.nombre ?? "—",
      monto: Number(l.monto),
    });
    porAjuste.set(l.ajuste_id, lista);
  }
  return (data ?? []).map((a) => ({
    id: a.id as string,
    periodo: mes(a.periodo),
    clase: a.clase as ClaseAjuste,
    concepto: a.concepto as string,
    origen: a.origen as OrigenAjuste,
    origenRef: (a.origen_ref as string | null) ?? null,
    efecto: Number(a.efecto),
    notas: (a.notas as string | null) ?? null,
    creadoEn: a.creado_en as string,
    creadoPor: (a.creado_por as string | null) ?? null,
    lineas: porAjuste.get(a.id as string) ?? [],
  }));
}

// ---------------------------------------------------------------------------------------------
// Cuadres
// ---------------------------------------------------------------------------------------------
export interface CuadreMes extends CuadreGuardado {
  clase: ClaseCuadre;
  detalle: unknown;
  registradoEn: string;
  registradoPor: string | null;
}

export async function cargarCuadres(supabase: SupabaseClient, periodo: string): Promise<{ error: string } | CuadreMes[]> {
  const { data, error } = await supabase
    .from("fin_cierre_cuadres")
    .select("clase, valor_libros, valor_sistema, diferencia, detalle, explicacion, registrado_en, registrado_por")
    .eq("periodo", periodo);
  if (error) return { error: SIN_MIGRACION_CONTROL };
  return (data ?? []).map((c) => ({
    clase: c.clase as ClaseCuadre,
    libros: Number(c.valor_libros),
    sistema: Number(c.valor_sistema),
    diferencia: Number(c.diferencia),
    explicacion: (c.explicacion as string | null) ?? null,
    detalle: c.detalle,
    registradoEn: c.registrado_en as string,
    registradoPor: (c.registrado_por as string | null) ?? null,
  }));
}

/** Valor del inventario del WMS en Panamá hoy (la base lo suma: `fin_capital_trabajo_al`). */
export async function valorInventarioWms(supabase: SupabaseClient): Promise<{ valor: number; unidades: number; sinCosto: number } | null> {
  const { data, error } = await supabase.rpc("fin_capital_trabajo_al", { p_corte: null });
  const f = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (error || !f) return null;
  return { valor: Number(f.inventario_valor ?? 0), unidades: Number(f.inventario_unidades ?? 0), sinCosto: Number(f.skus_sin_costo ?? 0) };
}

/** Lo que Dropi tiene pendiente al cierre del mes y la cartera por cobrar de los libros con Dropi. */
export async function partesDropiAl(supabase: SupabaseClient, corte: string, contraparte: string): Promise<PartesDropi | null> {
  const { data, error } = await supabase.rpc("fin_cuadre_dropi_al", { p_corte: corte, p_pais: "PA", p_contraparte: contraparte });
  if (error) return null;
  return leerPartesDropi((Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null);
}

/** Compras de mercancía del mes en el libro (tipos de costo de ventas que son compras o importación). */
export async function comprasMercanciaMes(supabase: SupabaseClient, periodo: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("fin_eerr_mensual")
    .select("monto, fin_tipos!inner(nombre)")
    .eq("periodo", periodo)
    .eq("seccion", "costo_ventas");
  if (error) return null;
  return (
    Math.round(
      ((data ?? []) as { monto: number | string; fin_tipos: { nombre: string } | { nombre: string }[] }[])
        .filter((f) => {
          const n = (Array.isArray(f.fin_tipos) ? f.fin_tipos[0]?.nombre : f.fin_tipos?.nombre) ?? "";
          return /compra|importaci/i.test(n);
        })
        .reduce((a, f) => a + Number(f.monto), 0) * 100,
    ) / 100
  );
}

// ---------------------------------------------------------------------------------------------
// Variaciones
// ---------------------------------------------------------------------------------------------
async function explicacionesDe(supabase: SupabaseClient, desde: string, hasta: string): Promise<Map<string, Map<string, string>> | null> {
  const { data, error } = await supabase.from("fin_cierre_variaciones").select("periodo, linea, explicacion").gte("periodo", desde).lte("periodo", hasta);
  if (error) return null;
  const out = new Map<string, Map<string, string>>();
  for (const v of data ?? []) {
    const m = mes(v.periodo);
    const mapa = out.get(m) ?? new Map<string, string>();
    mapa.set(v.linea as string, v.explicacion as string);
    out.set(m, mapa);
  }
  return out;
}

/** Las líneas del EERR consolidado de un mes contra el anterior (null si falta el EERR o la migración). */
export async function cargarVariaciones(supabase: SupabaseClient, periodo: string, config: ConfigCierre): Promise<LineaVariacion[] | null> {
  const anterior = mesAnteriorDe(periodo);
  const [e, expl] = await Promise.all([cargarEerr(supabase, null, [anterior, periodo]), explicacionesDe(supabase, periodo, periodo)]);
  if ("error" in e || !expl) return null;
  return lineasVariacion(armarEerr(e.filas, [anterior, periodo]), periodo, anterior, config, expl.get(periodo) ?? new Map());
}

// ---------------------------------------------------------------------------------------------
// Lo que miran las tareas nuevas del checklist
// ---------------------------------------------------------------------------------------------
export interface DatosControlMes {
  devengos: { esperados: number; registrados: number } | null;
  provisiones: { conPlanilla: boolean; registradas: number } | null;
  cuadreInventario: { cuadre: CuadreGuardado | null; tolerancia: number } | null;
  cuadreDropi: { cuadre: CuadreGuardado | null; tolerancia: number } | null;
  variaciones: { superan: number; sinExplicar: number } | null;
}

export async function cargarDatosControl(supabase: SupabaseClient, meses: string[]): Promise<Map<string, DatosControlMes>> {
  const salida = new Map<string, DatosControlMes>();
  if (!meses.length) return salida;
  const desde = meses[0];
  const hasta = meses[meses.length - 1];
  const ventana = rango(mesAnteriorDe(desde), hasta);
  const [{ config }, prepagos, ajustes, nomina, cuadres, eerr, expl] = await Promise.all([
    cargarConfigCierre(supabase),
    cargarPrepagos(supabase, true),
    supabase.from("fin_ajustes_cierre").select("periodo, origen, origen_ref").neq("origen", "manual").gte("periodo", desde).lte("periodo", hasta),
    supabase.from("nom_costo_mensual").select("periodo, bruto").eq("tipo", "formal").gte("periodo", desde).lte("periodo", hasta),
    supabase.from("fin_cierre_cuadres").select("periodo, clase, valor_libros, valor_sistema, diferencia, explicacion").gte("periodo", desde).lte("periodo", hasta),
    cargarEerr(supabase, null, ventana),
    explicacionesDe(supabase, desde, hasta),
  ]);
  const eerrArmado = "error" in eerr ? null : armarEerr(eerr.filas, ventana);
  const registradas = new Set((ajustes.data ?? []).map((a) => `${mes(a.periodo)}|${a.origen}|${a.origen_ref}`));
  for (const m of meses) {
    let devengos: DatosControlMes["devengos"] = null;
    if (!("error" in prepagos) && !ajustes.error) {
      const esperadas = prepagos.flatMap((p) => lineasDevengoDelMes(p, m).map((l) => `${p.id}:${l.ref}`));
      devengos = { esperados: esperadas.length, registrados: esperadas.filter((r) => registradas.has(`${m}|devengo|${r}`)).length };
    }
    const provisiones: DatosControlMes["provisiones"] =
      nomina.error || ajustes.error
        ? null
        : {
            conPlanilla: (nomina.data ?? []).some((n) => mes(n.periodo) === m && Number(n.bruto) > 0),
            registradas: CLAVES_PROVISION.filter((c) => registradas.has(`${m}|provision_nomina|${c}`)).length,
          };
    const cuadre = (clase: ClaseCuadre, tolerancia: number) => {
      if (cuadres.error) return null;
      const c = (cuadres.data ?? []).find((x) => mes(x.periodo) === m && x.clase === clase);
      return {
        cuadre: c ? { libros: Number(c.valor_libros), sistema: Number(c.valor_sistema), diferencia: Number(c.diferencia), explicacion: (c.explicacion as string | null) ?? null } : null,
        tolerancia,
      };
    };
    const variaciones =
      eerrArmado && expl ? resumenVariaciones(lineasVariacion(eerrArmado, m, mesAnteriorDe(m), config, expl.get(m) ?? new Map())) : null;
    salida.set(m, {
      devengos,
      provisiones,
      cuadreInventario: cuadre("inventario", config.toleranciaInventario),
      cuadreDropi: cuadre("cartera_dropi", config.toleranciaDropi),
      variaciones,
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Reaperturas
// ---------------------------------------------------------------------------------------------
export interface Reapertura {
  id: string;
  periodo: string;
  reabiertoEn: string;
  reabiertoPor: string | null;
  motivo: string;
  cerradoEn: string | null;
  cerradoPor: string | null;
}

export async function cargarReaperturas(supabase: SupabaseClient, limite = 20, periodo?: string): Promise<{ error: string } | Reapertura[]> {
  let q = supabase
    .from("fin_cierre_reaperturas")
    .select("id, periodo, reabierto_en, reabierto_por, motivo, cerrado_en, cerrado_por")
    .order("reabierto_en", { ascending: false })
    .limit(limite);
  if (periodo) q = q.eq("periodo", periodo);
  const { data, error } = await q;
  if (error) return { error: SIN_MIGRACION_CONTROL };
  return (data ?? []).map((r) => ({
    id: r.id as string,
    periodo: mes(r.periodo),
    reabiertoEn: r.reabierto_en as string,
    reabiertoPor: (r.reabierto_por as string | null) ?? null,
    motivo: r.motivo as string,
    cerradoEn: (r.cerrado_en as string | null) ?? null,
    cerradoPor: (r.cerrado_por as string | null) ?? null,
  }));
}

/** Responsables y fechas límite guardados de las tareas de unos cierres. */
export async function cargarAsignaciones(
  supabase: SupabaseClient,
  cierreIds: string[],
): Promise<Map<string, { responsableId: string | null; fechaLimite: string | null }> | null> {
  if (!cierreIds.length) return new Map();
  const r = await traerTodasConError<{ cierre_id: string; clave: string; responsable_id: string | null; fecha_limite: string | null }>((a, b) =>
    supabase.from("fin_cierre_tareas").select("cierre_id, clave, responsable_id, fecha_limite").in("cierre_id", cierreIds).order("id").range(a, b),
  );
  if (r.error) return null;
  return new Map((r.data ?? []).map((t) => [`${t.cierre_id}|${t.clave}`, { responsableId: t.responsable_id, fechaLimite: t.fecha_limite ? mes(t.fecha_limite) : null }]));
}

/** Las personas activas que se pueden elegir como responsables. */
export async function personasActivas(supabase: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("perfiles").select("id, nombre, email, activo").eq("activo", true).order("nombre");
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: ((p.nombre as string | null) || (p.email as string | null) || "—").trim() }));
}

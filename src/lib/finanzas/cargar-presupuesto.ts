// Lectura de Presupuesto y escenarios desde Supabase (migración 0913) y del real por tienda (vista `fin_eerr_mensual`,
// migración 0901). La comparten las páginas de /presupuesto, sus acciones y la descarga en Excel. Solo lectura; los
// permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { armarEerr, type FilaEerr, type Seccion } from "./eerr";
import { UNIDAD_SIN_ASIGNAR } from "./libro-excel";
import {
  elegirPresupuesto,
  esDividendo,
  esSeccion,
  serieDeEerr,
  supuestosGuardados,
  valorEnSeccion,
  type Escenario,
  type EstadoPresupuesto,
  type RealTipo,
  type SerieSecciones,
  type Supuestos,
} from "./presupuesto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

interface FilaVista {
  periodo: string;
  unidad_id: string;
  tipo_id: string;
  seccion: Seccion;
  signo: number;
  monto: number | string;
}

export interface RealPorUnidad {
  porUnidad: Map<string, SerieSecciones>;
  conDatos: Set<string>;
  /** El mismo real por tipo, como se lee en su sección y sin los retiros de dividendos (suma lo mismo que `porUnidad`). */
  tipos: RealTipo[];
  /** Nombre de cada tipo de `fin_tipos`, por id. */
  nombresTipo: Record<string, string>;
}

/**
 * El real de los meses dados, una serie por unidad (todas las de la vista: sumadas dan el consolidado del Estado de
 * resultados) y el detalle por tipo. `conDatos` son los meses con algún movimiento.
 */
export async function cargarRealPorUnidad(supabase: SupabaseClient, meses: string[]): Promise<{ error: string } | RealPorUnidad> {
  if (!meses.length) return { porUnidad: new Map(), conDatos: new Set(), tipos: [], nombresTipo: {} };
  const [tipos, vista] = await Promise.all([
    supabase.from("fin_tipos").select("id, nombre, orden"),
    traerTodasConError<FilaVista>((desde, hasta) =>
      supabase
        .from("fin_eerr_mensual")
        .select("periodo, unidad_id, tipo_id, seccion, signo, monto")
        .gte("periodo", meses[0])
        .lte("periodo", meses[meses.length - 1])
        .order("periodo")
        .order("unidad_id")
        .order("tipo_id")
        .range(desde, hasta),
    ),
  ]);
  if (tipos.error) return { error: tipos.error.message };
  if (vista.error) return { error: "No se pudo leer el EERR real." };
  const porId = new Map((tipos.data ?? []).map((t) => [t.id as string, { nombre: t.nombre as string, orden: t.orden as number }]));
  const porUnidadFilas = new Map<string, FilaEerr[]>();
  const conDatos = new Set<string>();
  const reales: RealTipo[] = [];
  for (const f of vista.data ?? []) {
    const periodo = String(f.periodo).slice(0, 10);
    conDatos.add(periodo);
    const nombre = porId.get(f.tipo_id)?.nombre ?? "—";
    if (esSeccion(f.seccion) && f.tipo_id && !(f.seccion === "otros" && esDividendo(nombre))) {
      reales.push({ unidad_id: f.unidad_id, tipo_id: f.tipo_id, seccion: f.seccion, periodo, valor: valorEnSeccion(f.seccion, Number(f.signo), Number(f.monto)) });
    }
    const lista = porUnidadFilas.get(f.unidad_id) ?? [];
    lista.push({
      periodo,
      unidad_id: f.unidad_id,
      tipo: porId.get(f.tipo_id)?.nombre ?? "—",
      orden: porId.get(f.tipo_id)?.orden ?? 999,
      seccion: f.seccion,
      signo: Number(f.signo),
      monto: Number(f.monto),
    });
    porUnidadFilas.set(f.unidad_id, lista);
  }
  const porUnidad = new Map<string, SerieSecciones>();
  for (const [u, filas] of porUnidadFilas) porUnidad.set(u, serieDeEerr(armarEerr(filas, meses)));
  const nombresTipo = Object.fromEntries([...porId].map(([id, t]) => [id, t.nombre]));
  return { porUnidad, conDatos, tipos: reales, nombresTipo };
}

export interface UnidadPresupuesto {
  id: string;
  nombre: string;
  orden: number;
}

/** Nombre de todas las unidades (las que aparecen en un presupuesto por tienda). */
export async function unidadesPresupuesto(supabase: SupabaseClient): Promise<UnidadPresupuesto[]> {
  const { data } = await supabase.from("fin_unidades").select("id, nombre, orden").order("orden");
  return ((data ?? []) as UnidadPresupuesto[]).map((u) => ({ ...u, nombre: u.nombre === UNIDAD_SIN_ASIGNAR ? "Sin asignar" : u.nombre }));
}

export interface Presupuesto {
  id: string;
  nombre: string;
  anio: number;
  estado: EstadoPresupuesto;
  por_tienda: boolean;
  supuestos: Supuestos | null;
  notas: string | null;
  creado_en: string;
  aprobado_en: string | null;
  cerrado_en: string | null;
}

export interface LineaGuardada {
  escenario: Escenario;
  periodo: string;
  unidad_id: string | null;
  seccion: Seccion;
  tipo_id: string | null;
  monto: number;
  origen: "manual" | "generado";
}

const COLUMNAS = "id, nombre, anio, estado, por_tienda, supuestos, notas, creado_en, aprobado_en, cerrado_en";

const aPresupuesto = (r: Record<string, unknown>): Presupuesto => ({
  id: r.id as string,
  nombre: r.nombre as string,
  anio: Number(r.anio),
  estado: r.estado as EstadoPresupuesto,
  por_tienda: !!r.por_tienda,
  supuestos: supuestosGuardados(r.supuestos),
  notas: (r.notas as string | null) ?? null,
  creado_en: r.creado_en as string,
  aprobado_en: (r.aprobado_en as string | null) ?? null,
  cerrado_en: (r.cerrado_en as string | null) ?? null,
});

/** Un presupuesto y todas sus líneas. */
export async function cargarPresupuesto(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string } | { presupuesto: Presupuesto; lineas: LineaGuardada[] } | { noExiste: true }> {
  if (!esUuid(id)) return { noExiste: true };
  const [cab, lineas] = await Promise.all([
    supabase.from("fin_presupuestos").select(COLUMNAS).eq("id", id).maybeSingle(),
    traerTodasConError<Record<string, unknown>>((desde, hasta) =>
      supabase
        .from("fin_presupuesto_lineas")
        .select("escenario, periodo, unidad_id, seccion, tipo_id, monto, origen")
        .eq("presupuesto_id", id)
        .order("escenario")
        .order("periodo")
        .order("seccion")
        .order("id")
        .range(desde, hasta),
    ),
  ]);
  if (cab.error) return { error: cab.error.message };
  if (!cab.data) return { noExiste: true };
  if (lineas.error) return { error: "No se pudieron leer las líneas del presupuesto." };
  return {
    presupuesto: aPresupuesto(cab.data),
    lineas: (lineas.data ?? []).map((l) => ({
      escenario: l.escenario as Escenario,
      periodo: String(l.periodo).slice(0, 10),
      unidad_id: (l.unidad_id as string | null) ?? null,
      seccion: l.seccion as Seccion,
      tipo_id: (l.tipo_id as string | null) ?? null,
      monto: Number(l.monto),
      origen: l.origen as "manual" | "generado",
    })),
  };
}

export interface TotalPresupuesto {
  presupuesto_id: string;
  escenario: Escenario;
  seccion: Seccion;
  monto: number;
}

/** La lista de presupuestos con sus totales por escenario y sección (vista `fin_presupuesto_totales`). */
export async function cargarListaPresupuestos(
  supabase: SupabaseClient,
): Promise<{ error: string } | { presupuestos: Presupuesto[]; totales: TotalPresupuesto[] }> {
  const [lista, totales] = await Promise.all([
    supabase.from("fin_presupuestos").select(COLUMNAS).order("anio", { ascending: false }).order("creado_en", { ascending: false }),
    traerTodasConError<Record<string, unknown>>((desde, hasta) =>
      supabase
        .from("fin_presupuesto_totales")
        .select("presupuesto_id, escenario, seccion, monto")
        .order("presupuesto_id")
        .order("escenario")
        .order("seccion")
        .range(desde, hasta),
    ),
  ]);
  if (lista.error) return { error: lista.error.message };
  if (totales.error) return { error: "No se pudieron leer los totales de los presupuestos." };
  return {
    presupuestos: (lista.data ?? []).map(aPresupuesto),
    totales: (totales.data ?? []).map((t) => ({ ...t, monto: Number(t.monto) }) as TotalPresupuesto),
  };
}

export interface PresupuestoVigente {
  presupuesto: Presupuesto;
  /** Las líneas del escenario base (todas las tiendas). */
  lineas: LineaGuardada[];
  /** Los presupuestos del año, para elegir otro con `?presupuesto=`. */
  opciones: { id: string; nombre: string; estado: EstadoPresupuesto }[];
}

/**
 * El presupuesto contra el que se mide un año (Panel financiero e Informe mensual): el elegido con `?presupuesto=` si es
 * de ese año; si no, el aprobado más reciente; si no hay aprobado, el más reciente. Solo el escenario base. null si el
 * año no tiene presupuesto o falta la migración 0913.
 */
export async function cargarPresupuestoVigente(supabase: SupabaseClient, anio: number, elegido?: unknown): Promise<PresupuestoVigente | null> {
  const lista = await supabase.from("fin_presupuestos").select(COLUMNAS).eq("anio", anio).order("creado_en", { ascending: false });
  if (lista.error || !lista.data?.length) return null;
  const presupuestos = lista.data.map(aPresupuesto);
  const presupuesto = elegirPresupuesto(presupuestos, elegido);
  if (!presupuesto) return null;
  const lineas = await traerTodasConError<Record<string, unknown>>((desde, hasta) =>
    supabase
      .from("fin_presupuesto_lineas")
      .select("escenario, periodo, unidad_id, seccion, tipo_id, monto, origen")
      .eq("presupuesto_id", presupuesto.id)
      .eq("escenario", "base")
      .order("periodo")
      .order("seccion")
      .order("id")
      .range(desde, hasta),
  );
  if (lineas.error) return null;
  return {
    presupuesto,
    lineas: (lineas.data ?? []).map((l) => ({
      escenario: l.escenario as Escenario,
      periodo: String(l.periodo).slice(0, 10),
      unidad_id: (l.unidad_id as string | null) ?? null,
      seccion: l.seccion as Seccion,
      tipo_id: (l.tipo_id as string | null) ?? null,
      monto: Number(l.monto),
      origen: l.origen as "manual" | "generado",
    })),
    opciones: presupuestos.map((p) => ({ id: p.id, nombre: p.nombre, estado: p.estado })),
  };
}

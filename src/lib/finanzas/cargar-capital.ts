// Lectura de Capital y riesgo › Proyectos y Asignación (mejoras 39 y 42; migración 0949 para los proyectos). Solo lectura;
// los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarMeses } from "@/lib/af4/fecha";
import { cargarDeudaComite, cargarEerrConsolidado, cargarTecho, cargarUnidadesPauta } from "./cargar-comite";
import { cargarAgrupado } from "./cargar-unidad-economica";
import { CLAVE_CAPITAL, leerConfigCapital, type ConfigCapital } from "./capital-config";
import type { TiendaCapital } from "./asignacion-capital";
import { costoFinanciero, interesesPorMes } from "./comite";
import { esEstadoProyecto, esPeriodicidad, leerPeriodos, type EstadoProyecto, type PeriodoFlujo, type Periodicidad } from "./evaluacion-proyectos";
import { techoDe } from "./pauta";
import { derivados } from "./unidad-economica";

export const SIN_MIGRACION_PROYECTOS = "Falta correr la migración 0949 (evaluación de proyectos) en Supabase.";

export async function cargarConfigCapital(supabase: SupabaseClient): Promise<ConfigCapital> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_CAPITAL).maybeSingle();
  return leerConfigCapital(error ? null : data?.valor);
}

/** El costo financiero mezclado de los últimos 3 meses cerrados (% anual), como en el comité; null sin datos. */
export async function costoFinancieroActual(supabase: SupabaseClient, hoy: string): Promise<number | null> {
  try {
    const ultimo = sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
    const tres = [sumarMeses(ultimo, -2), sumarMeses(ultimo, -1), ultimo];
    const ventana = [sumarMeses(tres[0], -1), ...tres];
    const [e, d] = await Promise.all([cargarEerrConsolidado(supabase, ventana), cargarDeudaComite(supabase, ventana)]);
    if ("error" in e) return null;
    return costoFinanciero(tres, interesesPorMes(e.eerr), d?.porMes ?? null).valor;
  } catch {
    return null;
  }
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  periodicidad: Periodicidad;
  tasa: number | null;
  inicio: string | null;
  flujos: PeriodoFlujo[];
  reales: (PeriodoFlujo | null)[];
  estado: EstadoProyecto;
  decididoPor: string | null;
  decididoEn: string | null;
  motivo: string | null;
  creadoEn: string;
}

export async function cargarProyectos(supabase: SupabaseClient): Promise<Proyecto[] | { error: string }> {
  const { data, error } = await supabase.from("fin_proyectos").select("*").order("creado_en", { ascending: false }).limit(200);
  if (error) return { error: SIN_MIGRACION_PROYECTOS };
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    nombre: String(p.nombre ?? ""),
    descripcion: (p.descripcion as string | null) ?? null,
    periodicidad: esPeriodicidad(p.periodicidad) ? p.periodicidad : "mes",
    tasa: p.tasa === null || p.tasa === undefined ? null : Number(p.tasa),
    inicio: p.inicio ? String(p.inicio).slice(0, 10) : null,
    flujos: leerPeriodos(p.flujos) as PeriodoFlujo[],
    reales: leerPeriodos(p.reales, true),
    estado: esEstadoProyecto(p.estado) ? p.estado : "borrador",
    decididoPor: (p.decidido_por_nombre as string | null) ?? null,
    decididoEn: (p.decidido_en as string | null) ?? null,
    motivo: (p.motivo_decision as string | null) ?? null,
    creadoEn: String(p.creado_en ?? ""),
  }));
}

/** Meses de la ventana de la asignación (los 3 cerrados). */
export const MESES_ASIGNACION = 3;

/**
 * Las tiendas con su unidad económica por mes (promedio de los últimos 3 meses cerrados): pauta, pedidos, ventas,
 * contribución antes de pauta, mercancía y tasa de entrega, más su techo de pauta.
 */
export async function cargarTiendasCapital(supabase: SupabaseClient, hoy: string): Promise<{ tiendas: TiendaCapital[]; desde: string; hasta: string } | { error: string }> {
  const hasta = sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
  const desde = sumarMeses(hasta, -(MESES_ASIGNACION - 1));
  const [filas, techo, unidades] = await Promise.all([cargarAgrupado(supabase, { desde, hasta, unidades: null }, "tienda"), cargarTecho(supabase), cargarUnidadesPauta(supabase)]);
  if ("error" in filas) return filas;
  const nombres = new Map(unidades.map((u) => [u.id, u.nombre]));
  const n = MESES_ASIGNACION;
  return {
    desde,
    hasta,
    tiendas: filas
      .filter((f) => f.ordenes > 0 || f.marketing > 0)
      .map((f) => ({
        unidadId: f.clave,
        nombre: nombres.get(f.clave) ?? f.etiqueta,
        pauta: f.marketing / n,
        pedidos: f.ordenes / n,
        ventas: f.ventas / n,
        contribucion: (f.margen + f.marketing) / n,
        mercancia: f.mercancia / n,
        tasaEntrega: derivados(f).tasaEntrega,
        techo: techoDe(techo.techo, f.clave),
      })),
  };
}

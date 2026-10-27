import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { diasDelPeriodo, type Periodo } from "./periodo";

const corto = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

/**
 * Las ventas (monto y cantidad de órdenes) de cada día de un rango, sumadas en la base (`ordenes_por_dia`, migración 0163). Antes se
 * pedían las filas sin paginar y Supabase entrega como mucho 1000: en 30 días de Panamá había 9.436 órdenes y «Hoy» sumaba 1.000
 * (corregido el 27 oct 2026). Sin la migración, se traen todas las filas paginando (exacto, pero más lento).
 */
async function ventasPorDia(supabase: SupabaseClient, paisId: string, desde: string, hasta: string): Promise<{ fecha: string; monto: number; ordenes: number }[]> {
  const r = await supabase.rpc("ordenes_por_dia", { p_pais: paisId, p_desde: desde, p_hasta: hasta });
  if (!r.error) return (r.data ?? []).map((x: { fecha: string; monto: number; ordenes: number }) => ({ fecha: String(x.fecha), monto: Number(x.monto), ordenes: Number(x.ordenes) }));
  const filas = await traerTodasLasFilas<{ fecha: string; monto: number }>((d, h) =>
    supabase.from("ordenes").select("fecha, monto").eq("pais_id", paisId).gte("fecha", desde).lte("fecha", hasta).order("id").range(d, h),
  ).catch(() => []);
  const dia = new Map<string, { fecha: string; monto: number; ordenes: number }>();
  for (const o of filas) {
    const x = dia.get(String(o.fecha)) ?? { fecha: String(o.fecha), monto: 0, ordenes: 0 };
    dia.set(x.fecha, x);
    x.monto += Number(o.monto);
    x.ordenes += 1;
  }
  return [...dia.values()];
}

/** Las entradas y salidas de inventario de cada día de un rango, sumadas en la base (`movimientos_por_dia`, migración 0163); sin ella, paginando. */
async function movimientosPorDia(supabase: SupabaseClient, paisId: string, desde: string, hasta: string): Promise<{ fecha: string; entradas: number; salidas: number }[]> {
  const r = await supabase.rpc("movimientos_por_dia", { p_pais: paisId, p_desde: desde, p_hasta: hasta });
  if (!r.error) return (r.data ?? []).map((x: { fecha: string; entradas: number; salidas: number }) => ({ fecha: String(x.fecha), entradas: Number(x.entradas), salidas: Number(x.salidas) }));
  const filas = await traerTodasLasFilas<{ fecha: string; tipo: string; cantidad: number }>((d, h) =>
    supabase.from("movimientos_inventario").select("fecha, tipo, cantidad").eq("pais_id", paisId).gte("fecha", desde).lte("fecha", hasta).order("id").range(d, h),
  ).catch(() => []);
  const dia = new Map<string, { fecha: string; entradas: number; salidas: number }>();
  for (const m of filas) {
    const x = dia.get(String(m.fecha)) ?? { fecha: String(m.fecha), entradas: 0, salidas: 0 };
    dia.set(x.fecha, x);
    if (m.tipo === "entrada") x.entradas += Number(m.cantidad);
    else x.salidas += Number(m.cantidad);
  }
  return [...dia.values()];
}

export interface PuntoInventario {
  fecha: string; // dd/mm
  entradas: number;
  salidas: number;
}

export interface SerieInventarioComparada {
  serie: PuntoInventario[];
  totalEntradas: number;
  totalSalidas: number;
  totalEntradasComparacion: number;
  totalSalidasComparacion: number;
}

/** Entradas vs salidas por día en el período dado, más los totales del período de comparación. */
export async function getSerieInventarioComparada(
  supabase: SupabaseClient,
  paisId: string,
  periodo: Periodo
): Promise<SerieInventarioComparada> {
  const [actuales, comparacion] = await Promise.all([
    movimientosPorDia(supabase, paisId, periodo.desde, periodo.hasta),
    movimientosPorDia(supabase, paisId, periodo.compararDesde, periodo.compararHasta),
  ]);

  const porDia = new Map<string, PuntoInventario>();
  for (const fecha of diasDelPeriodo(periodo.desde, periodo.hasta)) {
    porDia.set(fecha, { fecha: corto(fecha), entradas: 0, salidas: 0 });
  }
  let totalEntradas = 0;
  let totalSalidas = 0;
  for (const m of actuales) {
    const punto = porDia.get(m.fecha);
    if (!punto) continue;
    punto.entradas += m.entradas;
    punto.salidas += m.salidas;
    totalEntradas += m.entradas;
    totalSalidas += m.salidas;
  }

  let totalEntradasComparacion = 0;
  let totalSalidasComparacion = 0;
  for (const m of comparacion) {
    totalEntradasComparacion += m.entradas;
    totalSalidasComparacion += m.salidas;
  }

  return {
    serie: Array.from(porDia.values()),
    totalEntradas,
    totalSalidas,
    totalEntradasComparacion,
    totalSalidasComparacion,
  };
}

export interface PuntoVentas {
  fecha: string; // dd/mm
  actual: number;
  comparacion: number;
}

export interface SerieVentasComparada {
  serie: PuntoVentas[];
  totalActual: number;
  totalOrdenesActual: number;
  totalComparacion: number | null;
  sinHistorialComparacion: boolean;
}

/** Monto de órdenes de Dropi por día en el período dado, alineado día a día contra el período de comparación. */
export async function getSerieVentasComparada(
  supabase: SupabaseClient,
  paisId: string,
  periodo: Periodo
): Promise<SerieVentasComparada> {
  const [actuales, comparacion, { data: primeraOrden }] = await Promise.all([
    ventasPorDia(supabase, paisId, periodo.desde, periodo.hasta),
    ventasPorDia(supabase, paisId, periodo.compararDesde, periodo.compararHasta),
    supabase.from("ordenes").select("fecha").eq("pais_id", paisId).order("fecha", { ascending: true }).limit(1),
  ]);

  const diasActual = diasDelPeriodo(periodo.desde, periodo.hasta);
  const diasComparacion = diasDelPeriodo(periodo.compararDesde, periodo.compararHasta);

  const montoPorDiaActual = new Map<string, number>(diasActual.map((f) => [f, 0]));
  let totalActual = 0;
  let totalOrdenesActual = 0;
  for (const o of actuales) {
    montoPorDiaActual.set(o.fecha, (montoPorDiaActual.get(o.fecha) ?? 0) + o.monto);
    totalActual += o.monto;
    totalOrdenesActual += o.ordenes;
  }

  const montoPorDiaComparacion = new Map<string, number>(diasComparacion.map((f) => [f, 0]));
  let totalComparacion = 0;
  for (const o of comparacion) {
    montoPorDiaComparacion.set(o.fecha, (montoPorDiaComparacion.get(o.fecha) ?? 0) + o.monto);
    totalComparacion += o.monto;
  }

  const primeraFecha = primeraOrden?.[0]?.fecha ? String(primeraOrden[0].fecha) : null;
  const sinHistorialComparacion = !primeraFecha || primeraFecha > periodo.compararHasta;

  const serie: PuntoVentas[] = diasActual.map((fecha, i) => ({
    fecha: corto(fecha),
    actual: montoPorDiaActual.get(fecha) ?? 0,
    comparacion: montoPorDiaComparacion.get(diasComparacion[i]) ?? 0,
  }));

  return {
    serie,
    totalActual,
    totalOrdenesActual,
    totalComparacion: sinHistorialComparacion ? null : totalComparacion,
    sinHistorialComparacion,
  };
}

export interface PuntoFinanzas {
  periodo: string; // mm/yy
  diferencia: number;
}

/** Diferencia banco vs plataforma por mes, últimos 6 meses con datos, para el país dado. */
export async function getSerieFinanzas(
  supabase: SupabaseClient,
  paisId: string
): Promise<PuntoFinanzas[]> {
  const { data } = await supabase
    .from("conciliaciones")
    .select("periodo, diferencia")
    .eq("pais_id", paisId)
    .order("periodo", { ascending: true })
    .limit(6);

  return (data ?? []).map((c) => ({
    periodo: `${String(c.periodo).slice(5, 7)}/${String(c.periodo).slice(2, 4)}`,
    diferencia: Number(c.diferencia),
  }));
}

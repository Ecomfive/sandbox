import type { SupabaseClient } from "@supabase/supabase-js";
import { diasDelPeriodo, type Periodo } from "./periodo";

const corto = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

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
  const [{ data: actuales }, { data: comparacion }] = await Promise.all([
    supabase
      .from("movimientos_inventario")
      .select("fecha, tipo, cantidad")
      .eq("pais_id", paisId)
      .gte("fecha", periodo.desde)
      .lte("fecha", periodo.hasta),
    supabase
      .from("movimientos_inventario")
      .select("tipo, cantidad")
      .eq("pais_id", paisId)
      .gte("fecha", periodo.compararDesde)
      .lte("fecha", periodo.compararHasta),
  ]);

  const porDia = new Map<string, PuntoInventario>();
  for (const fecha of diasDelPeriodo(periodo.desde, periodo.hasta)) {
    porDia.set(fecha, { fecha: corto(fecha), entradas: 0, salidas: 0 });
  }
  let totalEntradas = 0;
  let totalSalidas = 0;
  for (const m of actuales ?? []) {
    const punto = porDia.get(String(m.fecha));
    if (!punto) continue;
    if (m.tipo === "entrada") {
      punto.entradas += Number(m.cantidad);
      totalEntradas += Number(m.cantidad);
    } else {
      punto.salidas += Number(m.cantidad);
      totalSalidas += Number(m.cantidad);
    }
  }

  let totalEntradasComparacion = 0;
  let totalSalidasComparacion = 0;
  for (const m of comparacion ?? []) {
    if (m.tipo === "entrada") totalEntradasComparacion += Number(m.cantidad);
    else totalSalidasComparacion += Number(m.cantidad);
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
  const [{ data: actuales }, { data: comparacion }, { data: primeraOrden }] = await Promise.all([
    supabase
      .from("ordenes")
      .select("fecha, monto")
      .eq("pais_id", paisId)
      .gte("fecha", periodo.desde)
      .lte("fecha", periodo.hasta),
    supabase
      .from("ordenes")
      .select("fecha, monto")
      .eq("pais_id", paisId)
      .gte("fecha", periodo.compararDesde)
      .lte("fecha", periodo.compararHasta),
    supabase.from("ordenes").select("fecha").eq("pais_id", paisId).order("fecha", { ascending: true }).limit(1),
  ]);

  const diasActual = diasDelPeriodo(periodo.desde, periodo.hasta);
  const diasComparacion = diasDelPeriodo(periodo.compararDesde, periodo.compararHasta);

  const montoPorDiaActual = new Map<string, number>(diasActual.map((f) => [f, 0]));
  let totalActual = 0;
  let totalOrdenesActual = 0;
  for (const o of actuales ?? []) {
    montoPorDiaActual.set(String(o.fecha), (montoPorDiaActual.get(String(o.fecha)) ?? 0) + Number(o.monto));
    totalActual += Number(o.monto);
    totalOrdenesActual += 1;
  }

  const montoPorDiaComparacion = new Map<string, number>(diasComparacion.map((f) => [f, 0]));
  let totalComparacion = 0;
  for (const o of comparacion ?? []) {
    montoPorDiaComparacion.set(
      String(o.fecha),
      (montoPorDiaComparacion.get(String(o.fecha)) ?? 0) + Number(o.monto)
    );
    totalComparacion += Number(o.monto);
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

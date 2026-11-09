// Lectura de la conciliación portal vs QuickBooks (migración 0950): lo leído de QuickBooks, el mapeo de cuentas y el
// Estado de resultados consolidado del portal (sin intercompañía) de los mismos meses, comparados con `compararMeses`. La
// usan Cierre de mes › QuickBooks, el checklist del cierre, el Comité y el Estado del sistema. Solo lectura; los permisos
// los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarEerrConsolidado } from "../finanzas/cargar-comite";
import type { Eerr } from "../finanzas/eerr";
import { compararMeses, cuadreVentasQbo, esDestino, type Comparacion, type Destino, type FilaQbo } from "./conciliacion";
import { leerConexionQbo, SIN_MIGRACION_QBO, type ConexionQbo } from "./cliente";
import type { GrupoPyg, TipoVenta } from "./reportes";

export interface DatosConciliacionQbo {
  conexion: Pick<ConexionQbo, "realm_id" | "entorno" | "conectado_en" | "ultima_lectura" | "ultimo_error" | "nombre_compania"> | null;
  filas: FilaQbo[];
  mapeo: Map<string, Destino>;
  mesesConQbo: Set<string>;
  ventas: { periodo: string; tipo: TipoVenta; documentos: number; total: number }[];
  portal: Eerr | null;
  sinIntercompania: boolean;
  comparaciones: Comparacion[];
}

/** Todo lo de la conciliación para los meses dados; `{ error }` sin la migración. */
export async function cargarConciliacionQbo(supabase: SupabaseClient, mesesPedidos: string[]): Promise<DatosConciliacionQbo | { error: string }> {
  const meses = [...new Set(mesesPedidos)].sort();
  const desde = meses[0];
  const hasta = meses[meses.length - 1];
  const [conexion, pyg, mapeo, ventas, eerr] = await Promise.all([
    leerConexionQbo(supabase),
    traerTodasConError<{ periodo: string; cuenta_id: string; cuenta_nombre: string; grupo: GrupoPyg; monto: number | string }>((a, b) =>
      supabase
        .from("qbo_pyg_mensual")
        .select("periodo, cuenta_id, cuenta_nombre, grupo, monto")
        .eq("clase_id", "")
        .gte("periodo", desde)
        .lte("periodo", hasta)
        .order("periodo")
        .order("cuenta_id")
        .range(a, b),
    ),
    supabase.from("qbo_mapeo").select("cuenta_id, destino"),
    supabase.from("qbo_ventas_mensual").select("periodo, tipo, documentos, total").gte("periodo", desde).lte("periodo", hasta),
    cargarEerrConsolidado(supabase, meses),
  ]);
  if (conexion && "error" in conexion) return conexion;
  if (pyg.error || mapeo.error || ventas.error) return { error: SIN_MIGRACION_QBO };
  const filas: FilaQbo[] = (pyg.data ?? []).map((f) => ({ periodo: String(f.periodo).slice(0, 10), cuentaId: f.cuenta_id, cuentaNombre: f.cuenta_nombre, grupo: f.grupo, monto: Number(f.monto) }));
  const mapa = new Map<string, Destino>();
  for (const m of mapeo.data ?? []) if (esDestino(m.destino)) mapa.set(String(m.cuenta_id), m.destino);
  const mesesConQbo = new Set(filas.map((f) => f.periodo));
  const portal = "error" in eerr ? null : eerr.eerr;
  return {
    conexion: conexion ? { realm_id: conexion.realm_id, entorno: conexion.entorno, conectado_en: conexion.conectado_en, ultima_lectura: conexion.ultima_lectura, ultimo_error: conexion.ultimo_error, nombre_compania: conexion.nombre_compania } : null,
    filas,
    mapeo: mapa,
    mesesConQbo,
    ventas: (ventas.data ?? []).map((v) => ({ periodo: String(v.periodo).slice(0, 10), tipo: v.tipo as TipoVenta, documentos: Number(v.documentos), total: Number(v.total) })),
    portal,
    sinIntercompania: "error" in eerr ? false : eerr.sinIntercompania,
    comparaciones: portal ? compararMeses(portal, filas, mapa, mesesConQbo) : [],
  };
}

/**
 * Las ventas netas de cada mes, portal contra QuickBooks, para el checklist del cierre. `undefined` si QuickBooks no está
 * conectado ni tiene nada leído (la tarea no se muestra); un mes sin lectura de QuickBooks queda con `qbo: null`.
 */
export async function cuadreVentasMeses(supabase: SupabaseClient, meses: string[]): Promise<Map<string, { portal: number; qbo: number | null; desviacion: number | null }> | undefined> {
  if (!meses.length) return undefined;
  // Primero lo barato: sin conexión ni nada leído no se arma el EERR.
  const [con, leido] = await Promise.all([
    supabase.from("qbo_conexion").select("id", { head: true, count: "exact" }),
    supabase.from("qbo_pyg_mensual").select("periodo", { head: true, count: "exact" }),
  ]);
  if (con.error || leido.error || (!con.count && !leido.count)) return undefined;
  const d = await cargarConciliacionQbo(supabase, meses).catch(() => ({ error: "falló" }));
  if ("error" in d) return undefined;
  if (!d.conexion && !d.filas.length) return undefined;
  const salida = new Map<string, { portal: number; qbo: number | null; desviacion: number | null }>();
  for (const m of meses) {
    const c = d.comparaciones.find((x) => x.periodo === m && x.concepto === "ventas");
    const portal = c?.portal ?? d.portal?.ingresosNetos[m] ?? 0;
    const qbo = d.mesesConQbo.has(m) ? (c?.qbo ?? 0) : null;
    salida.set(m, { portal, qbo, desviacion: cuadreVentasQbo(portal, qbo)?.desviacion ?? null });
  }
  return salida;
}

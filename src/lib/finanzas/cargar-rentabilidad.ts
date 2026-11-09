// Lectura de Rentabilidad por tienda y capital de trabajo desde Supabase (migración 0915; usa también 0901, 0905, 0909).
// La comparten las páginas de /rentabilidad y la descarga en Excel. Solo lectura; los permisos los decide quien llama.
// Sin la migración 0915 cae a un plan B (el EERR por tipo armado en JavaScript, y las carteras a hoy).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { unidadesEerr, type UnidadEerr } from "./cargar-eerr";
import { libroDesdeEerr, ventasPropias, type CarteraMes, type LibroMes, type Saldos, type VentasMes } from "./rentabilidad";

const num = (v: unknown) => Number(v ?? 0) || 0;
const dia = (v: unknown) => String(v).slice(0, 10);

export interface DatosRentabilidad {
  unidades: UnidadEerr[];
  libro: LibroMes[];
  /** Solo las tiendas con ingresos propios en el libro. */
  ventas: VentasMes[];
  /** Tiendas con órdenes pero sin ingresos en el libro (operadas para un tercero): fuera de la cascada. */
  deTerceros: string[];
  /** Falta la migración 0909 (Ventas por tienda): todo sale del libro. */
  sinVentas: boolean;
}

async function cargarLibro(supabase: SupabaseClient, desde: string, hasta: string): Promise<LibroMes[] | { error: string }> {
  const vista = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase
      .from("fin_rentabilidad_libro")
      .select("periodo, unidad_id, ingresos, devoluciones, mercancia, envio, otros_variables, marketing, administracion")
      .gte("periodo", desde)
      .lte("periodo", hasta)
      .order("periodo")
      .order("unidad_id")
      .range(d, h),
  );
  if (!vista.error) {
    return (vista.data ?? []).map((f) => ({
      periodo: dia(f.periodo),
      unidad_id: String(f.unidad_id),
      ingresos: num(f.ingresos),
      devoluciones: num(f.devoluciones),
      mercancia: num(f.mercancia),
      envio: num(f.envio),
      otros_variables: num(f.otros_variables),
      marketing: num(f.marketing),
      administracion: num(f.administracion),
    }));
  }
  // Plan B: sin la migración 0915, el EERR por tipo.
  const [tipos, eerr] = await Promise.all([
    supabase.from("fin_tipos").select("id, nombre"),
    traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase
        .from("fin_eerr_mensual")
        .select("periodo, unidad_id, tipo_id, seccion, signo, monto")
        .gte("periodo", desde)
        .lte("periodo", hasta)
        .order("periodo")
        .order("unidad_id")
        .order("tipo_id")
        .range(d, h),
    ),
  ]);
  if (tipos.error || eerr.error) return { error: "No se pudo leer el libro (migración 0901)." };
  const nombre = new Map((tipos.data ?? []).map((t) => [String(t.id), String(t.nombre)]));
  return libroDesdeEerr(
    (eerr.data ?? []).map((f) => ({
      periodo: dia(f.periodo),
      unidad_id: String(f.unidad_id),
      tipo: nombre.get(String(f.tipo_id)) ?? "",
      seccion: String(f.seccion),
      signo: num(f.signo),
      monto: num(f.monto),
    })),
  );
}

async function cargarVentas(supabase: SupabaseClient, desde: string, hasta: string): Promise<VentasMes[] | null> {
  const r = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase
      .from("ven_resumen_mensual")
      .select(
        "periodo, unidad_id, ordenes, enviadas, entregadas, ventas_entregadas, costo_mercancia, costo_envio, lineas_producto, lineas_costo_vigente, lineas_costo_excel",
      )
      .gte("periodo", desde)
      .lte("periodo", hasta)
      .order("periodo")
      .order("unidad_id")
      .range(d, h),
  );
  if (r.error) return null;
  return (r.data ?? []).map((f) => ({
    periodo: dia(f.periodo),
    unidad_id: String(f.unidad_id),
    ordenes: num(f.ordenes),
    enviadas: num(f.enviadas),
    entregadas: num(f.entregadas),
    ventas_entregadas: num(f.ventas_entregadas),
    costo_mercancia: num(f.costo_mercancia),
    costo_envio: num(f.costo_envio),
    lineas_producto: num(f.lineas_producto),
    lineas_con_costo: num(f.lineas_costo_vigente) + num(f.lineas_costo_excel),
  }));
}

/** Libro y ventas de los meses de la ventana (del más viejo al más nuevo). */
export async function cargarRentabilidad(supabase: SupabaseClient, ventana: string[]): Promise<DatosRentabilidad | { error: string }> {
  const desde = ventana[0];
  const hasta = ventana[ventana.length - 1];
  const [unidades, libro, ventas] = await Promise.all([
    unidadesEerr(supabase),
    cargarLibro(supabase, desde, hasta),
    cargarVentas(supabase, desde, hasta),
  ]);
  if ("error" in unidades) return unidades;
  if ("error" in libro) return libro;
  const { propias, deTerceros } = ventasPropias(ventas ?? [], libro);
  return { unidades: unidades.unidades, libro, ventas: propias, deTerceros, sinVentas: ventas === null };
}

export interface DatosCapital {
  saldos: Saldos;
  cobrosPendientes: number;
  skusConStock: number;
  skusSinCosto: number;
  cartera: CarteraMes[];
  /** Falta la migración 0915: solo las carteras a hoy. */
  parcial: boolean;
}

/** Saldos del capital de trabajo a hoy y la cartera al cierre de cada mes de la ventana. */
export async function cargarCapital(supabase: SupabaseClient, ventana: string[]): Promise<DatosCapital> {
  const [saldos, cartera] = await Promise.all([
    supabase.rpc("fin_capital_trabajo_al", { p_corte: null }),
    supabase.rpc("fin_cartera_mensual", { p_desde: ventana[0], p_hasta: ventana[ventana.length - 1] }),
  ]);
  const fila = Array.isArray(saldos.data) ? (saldos.data[0] as Record<string, unknown> | undefined) : undefined;
  if (!saldos.error && fila) {
    return {
      saldos: {
        cxcCartera: num(fila.cxc_cartera),
        cobrosPorDepositar: num(fila.cobros_por_depositar),
        efectivoRepartidores: num(fila.efectivo_repartidores),
        cxpCartera: num(fila.cxp_cartera),
        comprasAbiertas: num(fila.compras_abiertas),
        inventario: num(fila.skus_con_stock) > 0 ? num(fila.inventario_valor) : null,
      },
      cobrosPendientes: num(fila.cobros_pendientes),
      skusConStock: num(fila.skus_con_stock),
      skusSinCosto: num(fila.skus_sin_costo),
      cartera: cartera.error
        ? []
        : ((cartera.data ?? []) as Record<string, unknown>[]).map((c) => ({ periodo: dia(c.periodo), cxc: num(c.cxc), cxp: num(c.cxp) })),
      parcial: false,
    };
  }
  // Plan B: solo las carteras a hoy (migración 0905).
  const totales = await supabase.from("fin_cartera_totales").select("clase, saldo");
  const suma = (clase: string) => ((totales.data ?? []) as { clase: string; saldo: unknown }[]).filter((t) => t.clase === clase).reduce((a, t) => a + num(t.saldo), 0);
  return {
    saldos: { cxcCartera: suma("cobrar"), cobrosPorDepositar: 0, efectivoRepartidores: 0, cxpCartera: suma("pagar"), comprasAbiertas: 0, inventario: null },
    cobrosPendientes: 0,
    skusConStock: 0,
    skusSinCosto: 0,
    cartera: [],
    parcial: true,
  };
}

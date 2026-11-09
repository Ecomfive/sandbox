// Lectura de Ventas por tienda para las páginas. Solo lectura; los permisos los decide quien llama. Nunca lee
// `ven_ordenes_clientes` (datos de la persona): eso solo lo hace la ficha de una orden.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "../supabase/paginar";
import type { EstadoEntrega, MetodoPago } from "./matriz";
import type { FilaResumen, IngresoLibro } from "./resumen";

export interface Unidad {
  id: string;
  nombre: string;
  clase: string;
  recibe_reparto: boolean;
}

export async function cargarUnidades(supabase: SupabaseClient): Promise<Unidad[] | { error: string }> {
  const { data, error } = await supabase.from("fin_unidades").select("id, nombre, clase, recibe_reparto").order("orden");
  if (error) return { error: error.message };
  return (data ?? []) as Unidad[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** El resumen mensual desde un mes (incluido). `{ error }` si falta la migración 0909. */
export async function cargarResumen(supabase: SupabaseClient, desde: string, unidades: Unidad[]): Promise<FilaResumen[] | { error: string }> {
  const r = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase.from("ven_resumen_mensual").select("*").gte("periodo", desde).order("periodo").order("unidad_id").range(d, h),
  );
  if (r.error) return { error: r.error instanceof Error ? r.error.message : String((r.error as { message?: string }).message ?? r.error) };
  const nombre = new Map(unidades.map((u) => [u.id, u.nombre]));
  return (r.data ?? []).map((f) => ({
    periodo: String(f.periodo).slice(0, 10),
    unidad_id: String(f.unidad_id),
    tienda: nombre.get(String(f.unidad_id)) ?? "—",
    ordenes: num(f.ordenes),
    enviadas: num(f.enviadas),
    entregadas: num(f.entregadas),
    devueltas: num(f.devueltas),
    en_transito: num(f.en_transito),
    pendientes: num(f.pendientes),
    canceladas: num(f.canceladas),
    no_gestionadas: num(f.no_gestionadas),
    ventas_brutas: num(f.ventas_brutas),
    ventas_entregadas: num(f.ventas_entregadas),
    costo_mercancia: num(f.costo_mercancia),
    costo_envio: num(f.costo_envio),
    lineas_producto: num(f.lineas_producto),
    lineas_costo_vigente: num(f.lineas_costo_vigente),
    lineas_costo_excel: num(f.lineas_costo_excel),
  }));
}

/** Ingresos del libro por tienda y mes (sección ingresos de `fin_eerr_mensual`): bruto y devoluciones aparte. */
export async function cargarIngresosLibro(supabase: SupabaseClient, desde: string): Promise<IngresoLibro[]> {
  const r = await traerTodasConError<{ periodo: string; unidad_id: string; signo: number; monto: number | string }>((d, h) =>
    supabase
      .from("fin_eerr_mensual")
      .select("periodo, unidad_id, signo, monto")
      .eq("seccion", "ingresos")
      .gte("periodo", desde)
      .order("periodo")
      .order("unidad_id")
      .order("tipo_id")
      .range(d, h) as unknown as PromiseLike<{ data: { periodo: string; unidad_id: string; signo: number; monto: number | string }[] | null; error: unknown }>,
  );
  const mapa = new Map<string, IngresoLibro>();
  for (const f of r.data ?? []) {
    const periodo = String(f.periodo).slice(0, 10);
    const k = `${periodo}|${f.unidad_id}`;
    const x = mapa.get(k) ?? { periodo, unidad_id: f.unidad_id, bruto: 0, devoluciones: 0 };
    if (Number(f.signo) > 0) x.bruto += Number(f.monto);
    else x.devoluciones += Number(f.monto);
    mapa.set(k, x);
  }
  return [...mapa.values()];
}

export interface BaseActual {
  periodo: string;
  unidad_id: string;
  envios: number;
  entregados: number;
  origen: string;
}

export async function cargarBase(supabase: SupabaseClient, desde: string): Promise<BaseActual[]> {
  const r = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase
      .from("fin_base_distribucion")
      .select("periodo, unidad_id, envios, entregados, origen")
      .gte("periodo", desde)
      .order("periodo")
      .order("unidad_id")
      .range(d, h),
  );
  return (r.data ?? []).map((b) => ({
    periodo: String(b.periodo).slice(0, 10),
    unidad_id: String(b.unidad_id),
    envios: num(b.envios),
    entregados: num(b.entregados),
    origen: String(b.origen ?? "manual"),
  }));
}

export interface FilaOrden {
  id: string;
  numero: string;
  fecha: string;
  tienda: string;
  estado: EstadoEntrega;
  metodo: MetodoPago | null;
  formaPago: string | null;
  transportista: string | null;
  guia: string | null;
  fechaEnvio: string | null;
  total: number;
  costoEnvio: number;
  productos: string;
  unidades: number;
  facturado: boolean;
}

/** Tope de órdenes que se mandan a la tabla de una vez (un mes de Oferfy ronda las 5 000). */
export const LIMITE_ORDENES = 6000;

/** Las órdenes de un mes (y, si se pide, de una tienda y un estado), sin datos de la persona. */
export async function cargarOrdenes(
  supabase: SupabaseClient,
  periodo: string,
  unidades: Unidad[],
  filtro: { unidadId?: string | null; estado?: EstadoEntrega | null } = {},
): Promise<{ filas: FilaOrden[]; total: number } | { error: string }> {
  const nombre = new Map(unidades.map((u) => [u.id, u.nombre]));
  const consulta = () => {
    let q = supabase
      .from("ven_ordenes")
      .select(
        "id, numero, fecha, unidad_id, estado_entrega, metodo_pago, forma_pago_texto, transportista, guia, fecha_envio, total, costo_envio, facturado, ven_orden_lineas(linea, producto, cantidad)",
        { count: "exact" },
      )
      .eq("periodo", periodo);
    if (filtro.unidadId) q = q.eq("unidad_id", filtro.unidadId);
    if (filtro.estado) q = q.eq("estado_entrega", filtro.estado);
    return q.order("fecha", { ascending: false }).order("numero", { ascending: false });
  };
  const filas: FilaOrden[] = [];
  let total = 0;
  for (let desde = 0; desde < LIMITE_ORDENES; desde += 1000) {
    const { data, error, count } = await consulta().range(desde, Math.min(desde + 999, LIMITE_ORDENES - 1));
    if (error) return { error: error.message };
    total = count ?? total;
    for (const o of (data ?? []) as Record<string, unknown>[]) {
      const lineas = ((o.ven_orden_lineas as { linea: number; producto: string; cantidad: number | string }[] | null) ?? []).sort((a, b) => a.linea - b.linea);
      filas.push({
        id: String(o.id),
        numero: String(o.numero),
        fecha: String(o.fecha),
        tienda: nombre.get(String(o.unidad_id)) ?? "—",
        estado: o.estado_entrega as EstadoEntrega,
        metodo: (o.metodo_pago as MetodoPago | null) ?? null,
        formaPago: (o.forma_pago_texto as string | null) ?? null,
        transportista: (o.transportista as string | null) ?? null,
        guia: (o.guia as string | null) ?? null,
        fechaEnvio: (o.fecha_envio as string | null) ?? null,
        total: num(o.total),
        costoEnvio: num(o.costo_envio),
        productos: lineas.map((l) => l.producto).join(" · "),
        unidades: lineas.reduce((a, l) => a + num(l.cantidad), 0),
        facturado: o.facturado === true,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return { filas, total };
}

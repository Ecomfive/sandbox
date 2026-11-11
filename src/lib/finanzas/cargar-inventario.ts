// Lectura del inventario valorizado desde Supabase (migración 0921; usa el WMS 0069/0073 y Costos de mercancía 0908).
// Solo lectura; los permisos los decide quien llama. Panamá: el país de Finanzas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { DIAS_VENTAS, leerTasa, type FilaValorizada, type LoteVigilado, type Vendido } from "./inventario-valorizado";

export const PAIS_FINANZAS = "PA";
export const CLAVE_TASA = "inventario_tasa_mantener";
export const SIN_MIGRACION_INVENTARIO = "Falta correr la migración 0921 (inventario valorizado) en Supabase.";

export interface DatosInventario {
  filas: FilaValorizada[];
  vendido: Map<string, Vendido>;
  lotes: LoteVigilado[];
  tasa: number;
  /** Productos vendidos en la ventana sin costo (no suman al costo de lo vendido). */
  vendidosSinCosto: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const dia = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export async function cargarInventario(supabase: SupabaseClient, pais: string = PAIS_FINANZAS): Promise<DatosInventario | { error: string }> {
  const [vista, vendido, config, paisFila] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase
        .from("fin_inventario_valorizado")
        .select("bodega_id, bodega, bodega_tipo, sku_maestro_id, codigo, producto, lote_id, lote, fecha_vencimiento, unidades, costo_unitario, costo_fuente, valor, sin_costo, ultima_salida")
        .eq("pais", pais)
        .order("sku_maestro_id")
        .order("bodega_id")
        .order("lote_id")
        .range(d, h),
    ),
    supabase.rpc("fin_inventario_vendido", { p_dias: DIAS_VENTAS, p_pais: pais }),
    supabase.from("fin_config").select("valor").eq("clave", CLAVE_TASA).maybeSingle(),
    supabase.from("paises").select("id").eq("codigo", pais).maybeSingle(),
  ]);
  if (vista.error) return { error: SIN_MIGRACION_INVENTARIO };
  const vigilancia = paisFila.data?.id ? await supabase.rpc("wms_vigilancia_vencimientos", { p_pais: paisFila.data.id }) : null;
  const filas: FilaValorizada[] = (vista.data ?? []).map((f) => ({
    bodegaId: String(f.bodega_id),
    bodega: String(f.bodega ?? ""),
    bodegaTipo: String(f.bodega_tipo ?? ""),
    skuId: String(f.sku_maestro_id),
    codigo: String(f.codigo ?? ""),
    producto: String(f.producto ?? ""),
    loteId: (f.lote_id as string | null) ?? null,
    lote: (f.lote as string | null) ?? null,
    vencimiento: dia(f.fecha_vencimiento),
    unidades: num(f.unidades),
    costoUnitario: f.costo_unitario === null || f.costo_unitario === undefined ? null : num(f.costo_unitario),
    costoFuente: (f.costo_fuente as "lote" | "vigente" | null) ?? null,
    valor: num(f.valor),
    sinCosto: f.sin_costo === true,
    ultimaSalida: dia(f.ultima_salida),
  }));
  const vend = new Map<string, Vendido>();
  let vendidosSinCosto = 0;
  for (const v of vendido.error ? [] : ((vendido.data ?? []) as Record<string, unknown>[])) {
    vend.set(String(v.sku_maestro_id), { unidades: num(v.unidades), costo: num(v.costo) });
    if (v.sin_costo === true) vendidosSinCosto++;
  }
  const lotes: LoteVigilado[] = (vigilancia && !vigilancia.error ? ((vigilancia.data ?? []) as Record<string, unknown>[]) : []).map((l) => ({
    skuId: String(l.sku_maestro_id),
    codigo: String(l.sku ?? ""),
    producto: String(l.nombre ?? ""),
    loteId: String(l.lote_id),
    lote: String(l.lote ?? ""),
    vencimiento: String(l.fecha_vencimiento).slice(0, 10),
    diasRestantes: num(l.dias_restantes),
    cantidad: num(l.cantidad),
    estado: (l.estado as LoteVigilado["estado"]) ?? "vigente",
  }));
  return { filas, vendido: vend, lotes, tasa: config.error ? leerTasa(null) : leerTasa(config.data?.valor), vendidosSinCosto };
}

// El costo de cada producto para los pedidos de tienda (12 nov 2026, «Ingresos y costos» como en Mi Reto Digital). En Panamá hay dos y casi nunca
// coinciden: el costo de mercancía de Gestión de IDs Dropi del país (el que se usa como costo del país; suele incluir flete e importación) y el costo
// unitario de la última compra del país en Compras. Se toma el de Dropi y, si falta, el de la compra; siempre se dice de dónde salió, para revisarlo
// con Finanzas. Solo lectura.

import type { SupabaseClient } from "@supabase/supabase-js";

export type FuenteCosto = "dropi" | "compra";
export interface CostoProducto {
  costo: number;
  fuente: FuenteCosto;
}

export const NOMBRE_FUENTE_COSTO: Record<FuenteCosto, string> = { dropi: "costo de Dropi del país", compra: "última compra del país" };

/** El costo por unidad de esos productos en el país (`paisId`; por su id de `skus_maestros`). Los que no tienen ninguno no salen. */
export async function costosDeProductos(supabase: SupabaseClient, skuIds: string[], paisId: string): Promise<Map<string, CostoProducto>> {
  const ids = [...new Set(skuIds.filter(Boolean))];
  const mapa = new Map<string, CostoProducto>();
  if (!ids.length) return mapa;
  const pais = { id: paisId };
  for (let i = 0; i < ids.length; i += 200) {
    const parte = ids.slice(i, i + 200);
    const [dropi, compras] = await Promise.all([
      supabase.from("dropi_publicaciones").select("sku_maestro_id, costo_mercancia, actualizado_en").eq("pais_id", pais.id).in("sku_maestro_id", parte).gt("costo_mercancia", 0),
      supabase
        .from("wms_compra_items")
        .select("sku_maestro_id, costo_unitario, creado_en, wms_compras!inner(pais_id, anulada_en)")
        .in("sku_maestro_id", parte)
        .eq("wms_compras.pais_id", pais.id)
        .is("wms_compras.anulada_en", null)
        .gt("costo_unitario", 0)
        .order("creado_en", { ascending: false }),
    ]);
    // Dropi: si el producto tiene varias publicaciones, la más reciente.
    const deDropi = new Map<string, { costo: number; cuando: string }>();
    for (const d of (dropi.data ?? []) as { sku_maestro_id: string; costo_mercancia: number; actualizado_en: string | null }[]) {
      const previo = deDropi.get(d.sku_maestro_id);
      const cuando = d.actualizado_en ?? "";
      if (!previo || cuando > previo.cuando) deDropi.set(d.sku_maestro_id, { costo: Number(d.costo_mercancia), cuando });
    }
    for (const [id, d] of deDropi) mapa.set(id, { costo: d.costo, fuente: "dropi" });
    // La compra más reciente, para lo que no tiene costo en Dropi.
    for (const c of (compras.data ?? []) as { sku_maestro_id: string; costo_unitario: number }[])
      if (!mapa.has(c.sku_maestro_id)) mapa.set(c.sku_maestro_id, { costo: Number(c.costo_unitario), fuente: "compra" });
  }
  return mapa;
}

export interface IngresosYCostos {
  venta: number;
  /** El costo de los productos (cantidad × costo por unidad) de las líneas que se pudieron costear. */
  costoProductos: number;
  /** Líneas de producto sin producto nuestro o sin costo: el costo está incompleto. */
  lineasSinCosto: number;
  /** De dónde salieron los costos usados. */
  fuentes: FuenteCosto[];
  fulfillment: number | null;
  flete: number | null;
  /** Venta − costo − fulfillment − flete (lo que se sabe); null si no se pudo costear nada. */
  margen: number | null;
  /** Margen ÷ venta, en %. */
  margenPct: number | null;
}

/** Las cuentas de «Ingresos y costos» de un pedido. Sin base: con prueba. */
export function cuentasDelPedido(
  venta: number,
  lineas: { skuId: string | null; cantidad: number; esServicio: boolean }[],
  costos: Map<string, CostoProducto>,
  fulfillment: number | null,
  flete: number | null,
): IngresosYCostos {
  let costoProductos = 0;
  let lineasSinCosto = 0;
  const fuentes = new Set<FuenteCosto>();
  for (const l of lineas) {
    if (l.esServicio) continue;
    const c = l.skuId ? costos.get(l.skuId) : undefined;
    if (!c) {
      lineasSinCosto++;
      continue;
    }
    costoProductos += c.costo * l.cantidad;
    fuentes.add(c.fuente);
  }
  const conCosto = lineas.some((l) => !l.esServicio && l.skuId && costos.has(l.skuId));
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const margen = conCosto ? redondear(venta - costoProductos - (fulfillment ?? 0) - (flete ?? 0)) : null;
  return {
    venta: redondear(venta),
    costoProductos: redondear(costoProductos),
    lineasSinCosto,
    fuentes: [...fuentes],
    fulfillment,
    flete,
    margen,
    margenPct: margen !== null && venta > 0 ? Math.round((margen / venta) * 1000) / 10 : null,
  };
}

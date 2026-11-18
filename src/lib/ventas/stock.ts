// Inventario de una orden de tienda: reservar al confirmar, descontar al despachar, liberar al cancelar y reingresar lo
// devuelto. Solo si la tienda tiene una bodega elegida (`ven_tiendas_conexion.bodega_id`): sin ella no toca el inventario.
// Usa las funciones del WMS (`wms_aplicar_venta`, `wms_registrar_movimiento`). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";

interface Linea {
  sku: string | null;
  sku_maestro_id: string | null;
  /** El código del producto vinculado (el nuestro), para `wms_aplicar_venta`. */
  codigo: string | null;
  /** Las unidades del producto que salen: cantidad de la línea × unidades por venta (2 de un «Lleva 3» son 6; 18 nov 2026). */
  cantidad: number;
}

/**
 * Lo que sale de bodega por producto simple: un combo se reparte en sus componentes (cada uno por su cantidad) y los repetidos se suman.
 * Sin base: con prueba.
 */
export function unidadesPorProducto(lineas: { skuId: string; cantidad: number }[], componentesDe: Map<string, { skuId: string; cantidad: number }[]>): Map<string, number> {
  const total = new Map<string, number>();
  for (const l of lineas) {
    const partes = componentesDe.get(l.skuId) ?? [{ skuId: l.skuId, cantidad: 1 }];
    for (const c of partes) total.set(c.skuId, (total.get(c.skuId) ?? 0) + c.cantidad * l.cantidad);
  }
  return total;
}

/** Los componentes de los combos que haya entre esos productos. */
async function componentesDeCombos(supabase: SupabaseClient, skuIds: string[]): Promise<Map<string, { skuId: string; cantidad: number }[]>> {
  const mapa = new Map<string, { skuId: string; cantidad: number }[]>();
  if (!skuIds.length) return mapa;
  const { data } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").in("combo_id", [...new Set(skuIds)]);
  for (const c of (data ?? []) as { combo_id: string; componente_id: string; cantidad: number }[])
    mapa.set(c.combo_id, [...(mapa.get(c.combo_id) ?? []), { skuId: c.componente_id, cantidad: Number(c.cantidad) || 1 }]);
  return mapa;
}

async function bodegaDe(supabase: SupabaseClient, unidadId: string): Promise<string | null> {
  const { data } = await supabase.from("ven_tiendas_conexion").select("bodega_id").eq("unidad_id", unidadId).maybeSingle();
  return (data?.bodega_id as string | null | undefined) ?? null;
}

async function lineasDe(supabase: SupabaseClient, ordenId: string): Promise<Linea[]> {
  const { data } = await supabase
    .from("ven_orden_lineas")
    .select("sku, sku_maestro_id, unidades_por_venta, cantidad, es_servicio, skus_maestros(codigo)")
    .eq("orden_id", ordenId)
    .eq("es_servicio", false);
  type Fila = { sku: string | null; sku_maestro_id: string | null; unidades_por_venta: number | null; cantidad: number | string; skus_maestros: { codigo: string } | { codigo: string }[] | null };
  return ((data ?? []) as unknown as Fila[]).map((l) => {
    const sm = Array.isArray(l.skus_maestros) ? l.skus_maestros[0] : l.skus_maestros;
    return {
      sku: l.sku,
      sku_maestro_id: l.sku_maestro_id,
      codigo: sm?.codigo ?? null,
      cantidad: Math.max(1, Math.round(Number(l.cantidad) || 1)) * Math.max(1, Number(l.unidades_por_venta) || 1),
    };
  });
}

/** Dice qué producto no alcanza (para bloquear la confirmación). Sin bodega configurada no revisa nada. */
export async function faltaStock(supabase: SupabaseClient, unidadId: string, ordenId: string): Promise<string | null> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return null;
  const lineas = (await lineasDe(supabase, ordenId)).filter((l) => l.sku_maestro_id);
  if (!lineas.length) return null;
  // Lo que se necesita de cada producto simple (un combo, por sus componentes; varias líneas del mismo, sumadas).
  const necesita = unidadesPorProducto(
    lineas.map((l) => ({ skuId: l.sku_maestro_id as string, cantidad: l.cantidad })),
    await componentesDeCombos(supabase, lineas.map((l) => l.sku_maestro_id as string)),
  );
  const { data, error } = await supabase.from("wms_stock").select("sku_maestro_id, disponible").eq("bodega_id", bodega).in("sku_maestro_id", [...necesita.keys()]);
  if (error) return null;
  const disp = new Map(((data ?? []) as { sku_maestro_id: string; disponible: number | string }[]).map((s) => [s.sku_maestro_id, Number(s.disponible) || 0]));
  const falta = [...necesita].filter(([id, cantidad]) => (disp.get(id) ?? 0) < cantidad).map(([id]) => id);
  if (!falta.length) return null;
  const { data: nombres } = await supabase.from("skus_maestros").select("id, nombre").in("id", falta);
  const n = new Map(((nombres ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
  return `No hay stock de ${falta.map((id) => n.get(id) ?? "un producto").join(", ")} en la bodega de la tienda.`;
}

export type FaseStock = "reserva" | "liberacion" | "despacho";

/**
 * Aplica la fase a todas las líneas con producto. Va por el código del producto vinculado (18 nov 2026: antes por el SKU de Shopify, que casi nunca es el
 * nuestro) y por las unidades que salen; `wms_aplicar_venta` reparte los combos. Una línea sin vincular usa su SKU de Shopify, como antes.
 * Devuelve un error legible o null (también null si la tienda no usa bodega).
 */
export async function aplicarStock(supabase: SupabaseClient, unidadId: string, ordenId: string, numero: string, fase: FaseStock): Promise<string | null> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return null;
  for (const l of await lineasDe(supabase, ordenId)) {
    const codigo = l.codigo ?? l.sku;
    if (!codigo) continue;
    const { error } = await supabase.rpc("wms_aplicar_venta", { p_codigo: codigo, p_cantidad: l.cantidad, p_bodega: bodega, p_fase: fase, p_origen: "pedido", p_referencia: `Shopify ${numero}` });
    if (error) return `Inventario (${codigo}): ${error.message.replace(/^.*?exception:\s*/i, "")}`;
  }
  return null;
}

/** Devolución recibida en buen estado: vuelve al inventario, por las unidades que salieron (un combo, por sus componentes; 18 nov 2026). */
export async function reingresar(supabase: SupabaseClient, unidadId: string, ordenId: string, numero: string): Promise<{ error?: string; aviso?: string }> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return { aviso: "La tienda no tiene bodega: no se movió el inventario." };
  const lineas = await lineasDe(supabase, ordenId);
  const omitidas = lineas.filter((l) => !l.sku_maestro_id).length;
  const vinculadas = lineas.filter((l) => l.sku_maestro_id);
  const vuelve = unidadesPorProducto(
    vinculadas.map((l) => ({ skuId: l.sku_maestro_id as string, cantidad: l.cantidad })),
    await componentesDeCombos(supabase, vinculadas.map((l) => l.sku_maestro_id as string)),
  );
  for (const [skuId, cantidad] of vuelve) {
    const { error } = await supabase.rpc("wms_registrar_movimiento", { p_sku: skuId, p_bodega: bodega, p_tipo: "entrada", p_cantidad: cantidad, p_origen: "devolucion", p_referencia: `Devolución ${numero}`, p_motivo: "Devolución en buen estado" });
    if (error) return { error: error.message.replace(/^.*?exception:\s*/i, "") };
  }
  return omitidas ? { aviso: `${omitidas} líneas sin producto vinculado no se reingresaron.` } : {};
}

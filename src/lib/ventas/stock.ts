// Inventario de una orden de tienda: reservar al confirmar, descontar al despachar, liberar al cancelar y reingresar lo
// devuelto. Solo si la tienda tiene una bodega elegida (`ven_tiendas_conexion.bodega_id`): sin ella no toca el inventario.
// Usa las funciones del WMS (`wms_aplicar_venta`, `wms_registrar_movimiento`). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";

interface Linea {
  sku: string | null;
  sku_maestro_id: string | null;
  cantidad: number;
}

async function bodegaDe(supabase: SupabaseClient, unidadId: string): Promise<string | null> {
  const { data } = await supabase.from("ven_tiendas_conexion").select("bodega_id").eq("unidad_id", unidadId).maybeSingle();
  return (data?.bodega_id as string | null | undefined) ?? null;
}

async function lineasDe(supabase: SupabaseClient, ordenId: string): Promise<Linea[]> {
  const { data } = await supabase.from("ven_orden_lineas").select("sku, sku_maestro_id, cantidad, es_servicio").eq("orden_id", ordenId).eq("es_servicio", false);
  return ((data ?? []) as { sku: string | null; sku_maestro_id: string | null; cantidad: number | string }[]).map((l) => ({ sku: l.sku, sku_maestro_id: l.sku_maestro_id, cantidad: Math.max(1, Math.round(Number(l.cantidad) || 1)) }));
}

/** Dice qué producto no alcanza (para bloquear la confirmación). Sin bodega configurada no revisa nada. */
export async function faltaStock(supabase: SupabaseClient, unidadId: string, ordenId: string): Promise<string | null> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return null;
  const lineas = (await lineasDe(supabase, ordenId)).filter((l) => l.sku_maestro_id);
  if (!lineas.length) return null;
  const { data, error } = await supabase.from("wms_stock").select("sku_maestro_id, disponible").eq("bodega_id", bodega).in("sku_maestro_id", lineas.map((l) => l.sku_maestro_id as string));
  if (error) return null;
  const disp = new Map(((data ?? []) as { sku_maestro_id: string; disponible: number | string }[]).map((s) => [s.sku_maestro_id, Number(s.disponible) || 0]));
  const falta = lineas.filter((l) => (disp.get(l.sku_maestro_id as string) ?? 0) < l.cantidad);
  if (!falta.length) return null;
  const { data: nombres } = await supabase.from("skus_maestros").select("id, nombre").in("id", falta.map((l) => l.sku_maestro_id as string));
  const n = new Map(((nombres ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
  return `No hay stock de ${falta.map((l) => n.get(l.sku_maestro_id as string) ?? l.sku).join(", ")} en la bodega de la tienda.`;
}

export type FaseStock = "reserva" | "liberacion" | "despacho";

/** Aplica la fase a todas las líneas con SKU. Devuelve un error legible o null (también null si la tienda no usa bodega). */
export async function aplicarStock(supabase: SupabaseClient, unidadId: string, ordenId: string, numero: string, fase: FaseStock): Promise<string | null> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return null;
  for (const l of await lineasDe(supabase, ordenId)) {
    if (!l.sku) continue;
    const { error } = await supabase.rpc("wms_aplicar_venta", { p_codigo: l.sku, p_cantidad: l.cantidad, p_bodega: bodega, p_fase: fase, p_origen: "pedido", p_referencia: `Shopify ${numero}` });
    if (error) return `Inventario (${l.sku}): ${error.message.replace(/^.*?exception:\s*/i, "")}`;
  }
  return null;
}

/** Devolución recibida en buen estado: vuelve al inventario (los combos se reingresan por sus componentes en Producto). */
export async function reingresar(supabase: SupabaseClient, unidadId: string, ordenId: string, numero: string): Promise<{ error?: string; aviso?: string }> {
  const bodega = await bodegaDe(supabase, unidadId);
  if (!bodega) return { aviso: "La tienda no tiene bodega: no se movió el inventario." };
  let omitidas = 0;
  for (const l of await lineasDe(supabase, ordenId)) {
    if (!l.sku_maestro_id) {
      omitidas++;
      continue;
    }
    const { error } = await supabase.rpc("wms_registrar_movimiento", { p_sku: l.sku_maestro_id, p_bodega: bodega, p_tipo: "entrada", p_cantidad: l.cantidad, p_origen: "devolucion", p_referencia: `Devolución ${numero}`, p_motivo: "Devolución en buen estado" });
    if (error) return { error: error.message.replace(/^.*?exception:\s*/i, "") };
  }
  return omitidas ? { aviso: `${omitidas} líneas sin producto vinculado no se reingresaron.` } : {};
}

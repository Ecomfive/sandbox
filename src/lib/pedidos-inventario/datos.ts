// Pedir a inventario (16 nov 2026, migración 0305): lo que leen las dos pantallas. Despacho (Pedir a inventario) e inventario
// (Comunicación despacho › Solicitudes de despacho) ven la misma lista; cambian los botones. Por ahora solo Panamá: el destino es su bodega «Despacho…».

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { numeroTraslado } from "@/lib/wms/traslado";
import { esEstado, type EstadoPedido, type PedidoInventario } from "./reglas";

export interface BodegaPedido {
  id: string;
  nombre: string;
}

/** La bodega de despacho de Panamá (a donde llega lo que envía inventario) y las demás bodegas propias activas de Panamá (de donde sale). */
export async function cargarBodegasPedido(supabase: SupabaseClient): Promise<{ destino: BodegaPedido | null; origenes: BodegaPedido[] }> {
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").maybeSingle();
  if (!pais) return { destino: null, origenes: [] };
  const { data } = await supabase.from("wms_bodegas").select("id, nombre").eq("pais_id", pais.id).eq("tipo", "propia").eq("activa", true).order("orden").order("nombre");
  const bodegas = (data ?? []) as BodegaPedido[];
  const destino = bodegas.find((b) => /^despacho/i.test(b.nombre)) ?? null;
  return { destino, origenes: bodegas.filter((b) => b.id !== destino?.id) };
}

/** Lo disponible de esos productos en esas bodegas: `stock[bodega][sku]`. */
export async function cargarStock(supabase: SupabaseClient, bodegas: string[], skus: string[]): Promise<Record<string, Record<string, number>>> {
  const stock: Record<string, Record<string, number>> = {};
  if (!bodegas.length || !skus.length) return stock;
  for (let i = 0; i < skus.length; i += 200) {
    const { data } = await traerTodasConError<{ bodega_id: string; sku_maestro_id: string; disponible: number }>((d, h) =>
      supabase.from("wms_stock").select("bodega_id, sku_maestro_id, disponible").in("bodega_id", bodegas).in("sku_maestro_id", skus.slice(i, i + 200)).order("sku_maestro_id").order("bodega_id").range(d, h),
    );
    for (const s of data ?? []) (stock[s.bodega_id] ??= {})[s.sku_maestro_id] = Number(s.disponible);
  }
  return stock;
}

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Los pedidos: todos los abiertos (Solicitud, En proceso, Enviado) y los cerrados de los últimos 30 días, el más nuevo arriba.
 * Si falta la migración 0305, `faltaMigracion`.
 */
export async function cargarPedidos(supabase: SupabaseClient): Promise<{ pedidos: PedidoInventario[]; faltaMigracion: boolean }> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("despacho_pedidos_inventario")
    .select(
      "id, numero, estado, pedido_por, pedido_por_nombre, creado_en, responsable_nombre, enviado_en, recibido_por_nombre, recibido_en, origen:wms_bodegas!despacho_pedidos_inventario_bodega_origen_id_fkey(nombre), traslado:wms_traslados(numero), despacho_pedidos_inventario_items(id, orden, sku_id, producto, codigo, cantidad_pedida, nota, cantidad_entregada, observacion)",
    )
    .or(`estado.in.(solicitud,en_proceso,enviado),creado_en.gte.${desde}`)
    .order("creado_en", { ascending: false })
    .limit(500);
  if (error) return { pedidos: [], faltaMigracion: true };
  const pedidos = (data ?? []).map((p) => {
    const items = ((p.despacho_pedidos_inventario_items as Record<string, unknown>[] | null) ?? []).sort((a, b) => Number(a.orden) - Number(b.orden));
    const traslado = uno(p.traslado as { numero: number } | { numero: number }[] | null);
    return {
      id: p.id as string,
      numero: Number(p.numero),
      estado: (esEstado(p.estado) ? p.estado : "solicitud") as EstadoPedido,
      pedidoPor: p.pedido_por as string,
      pedidoPorNombre: (p.pedido_por_nombre as string | null) ?? null,
      creadoEn: p.creado_en as string,
      responsableNombre: (p.responsable_nombre as string | null) ?? null,
      enviadoEn: (p.enviado_en as string | null) ?? null,
      recibidoPorNombre: (p.recibido_por_nombre as string | null) ?? null,
      recibidoEn: (p.recibido_en as string | null) ?? null,
      origen: uno(p.origen as { nombre: string } | { nombre: string }[] | null)?.nombre ?? null,
      traslado: traslado ? numeroTraslado(traslado.numero) : null,
      items: items.map((it) => ({
        id: it.id as string,
        skuId: it.sku_id as string,
        producto: it.producto as string,
        codigo: (it.codigo as string | null) ?? null,
        cantidadPedida: Number(it.cantidad_pedida),
        nota: (it.nota as string | null) ?? null,
        cantidadEntregada: it.cantidad_entregada === null || it.cantidad_entregada === undefined ? null : Number(it.cantidad_entregada),
        observacion: (it.observacion as string | null) ?? null,
      })),
    } satisfies PedidoInventario;
  });
  return { pedidos, faltaMigracion: false };
}

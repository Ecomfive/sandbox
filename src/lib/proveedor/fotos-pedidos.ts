// Portal del proveedor: las fotos de cada pedido, igual que en Compras. La de referencia es la foto comercial (la de Producto: la de
// su primer producto con foto o, sin productos, la del producto con su mismo nombre); la foto real es la que subió Chin en el portal
// o, si no, la «Foto real del producto» de la compra (`wms_compras.foto_url`, que es lo que trae el espejo). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { productoDeCompra } from "@/lib/compras/foto-producto";
import { cargarFotosDeProductos } from "@/lib/compras/fotos-productos-datos";
import type { PedidoPortal } from "./datos";

/** Los pedidos con su foto comercial como referencia, y la foto real de la compra de cada uno (para cuando Chin no subió la suya). */
export async function conFotosDeCompras(supabase: SupabaseClient, pedidos: PedidoPortal[]): Promise<{ pedidos: PedidoPortal[]; realDeCompra: Record<string, string> }> {
  const realDeCompra: Record<string, string> = {};
  for (const p of pedidos) if (p.fotoReferencia) realDeCompra[p.id] = p.fotoReferencia;
  if (!pedidos.length) return { pedidos, realDeCompra };

  const fotos = await cargarFotosDeProductos(supabase);
  const lineas = new Map<string, { sku: string; creado: string }[]>();
  const ids = [...new Set(pedidos.map((p) => p.compraId))];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("wms_compra_items").select("compra_id, sku_maestro_id, creado_en").in("compra_id", ids.slice(i, i + 300));
    for (const l of data ?? []) lineas.set(l.compra_id as string, [...(lineas.get(l.compra_id as string) ?? []), { sku: l.sku_maestro_id as string, creado: l.creado_en as string }]);
  }
  const comercial = (p: PedidoPortal): string | null => {
    const deCompra = (lineas.get(p.compraId) ?? []).sort((a, b) => a.creado.localeCompare(b.creado));
    if (deCompra.length) return deCompra.map((l) => fotos.porId.get(l.sku)).find(Boolean) ?? null;
    const parecido = productoDeCompra(p.producto, null, fotos.indice);
    return parecido ? (fotos.porId.get(parecido.id) ?? null) : null;
  };
  return { pedidos: pedidos.map((p) => ({ ...p, fotoReferencia: comercial(p) })), realDeCompra };
}

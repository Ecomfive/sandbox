"use server";

import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarOrdenTienda, type OrdenTienda } from "@/lib/tienda/orden-detalle";

/** La orden para la ficha lateral de Pedidos (12 nov 2026). Basta poder abrir Pedidos de tienda; solo órdenes de tiendas del país elegido arriba. */
export async function obtenerPedidoTienda(id: string): Promise<{ orden: OrdenTienda; codigoPais: string; puedeEscribir: boolean } | { error: string }> {
  const usuario = await requireModulo("tienda-pedidos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const orden = await cargarOrdenTienda(supabase, String(id ?? ""), pais.id);
  return orden ? { orden, codigoPais: pais.codigo, puedeEscribir: !usuario.modulosSoloLectura.includes("tienda-pedidos") } : { error: "No se encontró el pedido (o es de otro país)." };
}

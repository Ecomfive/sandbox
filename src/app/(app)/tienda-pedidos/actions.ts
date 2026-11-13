"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import type { NotaOrden } from "@/lib/tienda/orden-detalle";

/** Una nota interna del equipo en un pedido de tienda. No va a Shopify: queda solo en el sistema. */
export async function agregarNotaPedido(pedidoId: string, texto: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-pedidos");
  const limpio = String(texto ?? "").trim().slice(0, 2000);
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return { error: "Pedido no válido." };
  if (!limpio) return { error: "Escribe la nota." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("tienda_pedido_notas").insert({ pedido_id: pedidoId, texto: limpio, autor_id: usuario.id, autor_nombre: usuario.nombre ?? usuario.email });
  if (error) return { error: "No se pudo guardar la nota." };
  revalidatePath(`/tienda-pedidos/${pedidoId}`);
  return {};
}

/**
 * Una nota del equipo en una orden de tienda (`ven_ordenes`, 12 nov 2026). Queda solo en el sistema (`ven_orden_notas`); no va a Shopify.
 * Solo en órdenes de tiendas del país elegido arriba.
 */
export async function agregarNotaOrden(ordenId: string, texto: string): Promise<{ nota: NotaOrden } | { error: string }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura("tienda-pedidos");
  } catch {
    return { error: "Tu rol solo puede leer los pedidos." };
  }
  const limpio = String(texto ?? "").trim().slice(0, 2000);
  if (!/^[0-9a-f-]{36}$/i.test(String(ordenId ?? ""))) return { error: "Pedido no válido." };
  if (!limpio) return { error: "Escribe la nota." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: orden } = await supabase.from("ven_ordenes").select("id, fin_unidades(clase, pais_id)").eq("id", ordenId).maybeSingle();
  const unidad = (orden?.fin_unidades ?? null) as unknown as { clase: string; pais_id: string } | null;
  if (!orden || !unidad || unidad.clase !== "tienda" || unidad.pais_id !== pais.id) return { error: "No se encontró el pedido (o es de otro país)." };
  const { data, error } = await supabase
    .from("ven_orden_notas")
    .insert({ orden_id: ordenId, texto: limpio, autor: usuario.nombre ?? usuario.email })
    .select("id, texto, autor, creado_en")
    .single();
  if (error || !data) return { error: "No se pudo guardar la nota." };
  revalidatePath(`/tienda-pedidos/${ordenId}`);
  return { nota: data as NotaOrden };
}

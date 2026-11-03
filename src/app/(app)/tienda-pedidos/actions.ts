"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

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

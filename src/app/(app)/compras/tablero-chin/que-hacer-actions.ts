"use server";

import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «Qué hacer con Shen Zhen»: da por vistas las novedades del proveedor (su marca «Nuevo») de los pedidos que se le pasan: el de una tarea
 * al abrirla, o los de todas las tareas a la vista con «Marcar todo como visto». Solo marca la lectura: no cambia la compra.
 * Devuelve el error como valor.
 */
export async function marcarVistoChin(pedidoIds: string[]): Promise<{ error?: string }> {
  await requireModulo("compras");
  if (!Array.isArray(pedidoIds) || !pedidoIds.length || pedidoIds.length > 500 || !pedidoIds.every((id) => typeof id === "string" && UUID.test(id))) return { error: "Pedidos no válidos." };
  const { error } = await createServiceClient()
    .from("proveedor_novedades")
    .update({ leida_en: new Date().toISOString() })
    .eq("lado", "proveedor")
    .is("leida_en", null)
    .in("pedido_id", pedidoIds);
  return error ? { error: "No se pudo marcar como visto." } : {};
}

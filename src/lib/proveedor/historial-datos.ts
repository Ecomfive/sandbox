// Lee el historial de un pedido del portal (de la Actividad de su compra) y la fecha en que Ecomfive confirmó cada pedido. Solo servidor:
// quien llama ya comprobó quién es (la cuenta del proveedor o una persona de Ecomfive con Compras).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechasDeConfirmacion, historialDePedido, type EventoCompra, type LineaHistorial } from "./historial";

const CAMPOS = ["cotizacion", "qtyTotal", "montoTotal", "productoAgregado", "productoCambiado", "productoQuitado", "etapa", "fechaEnvio", "fechaLlegada", "notaProveedor", "registroPagos"];

/** El historial de un pedido visible del proveedor, o el error como valor. Devuelve también el país, para que quien llama lo compruebe. */
export async function cargarHistorialPedido(
  supabase: SupabaseClient,
  proveedorId: string,
  pedidoId: string,
  conAutor: boolean,
): Promise<{ lineas: LineaHistorial[]; paisCodigo: string | null } | { error: string }> {
  const { data: p } = await supabase.from("proveedor_pedidos").select("compra_id, proveedor_id, visible, pais_codigo").eq("id", pedidoId).maybeSingle();
  if (!p || p.proveedor_id !== proveedorId || !p.visible) return { error: "Ese pedido ya no está en el portal." };
  const { data, error } = await supabase
    .from("wms_compra_eventos")
    .select("campo, valor_antes, valor_despues, ocurrido_en, autor, origen")
    .eq("compra_id", p.compra_id)
    .in("campo", CAMPOS)
    .order("ocurrido_en", { ascending: false })
    .limit(300);
  if (error) return { error: "No se pudo cargar el historial." };
  return { lineas: historialDePedido((data ?? []) as EventoCompra[], { conAutor }), paisCodigo: (p.pais_codigo as string | null) ?? null };
}

/**
 * Cuándo se confirmó (pasó a «En producción») cada una de estas compras, de 100 en 100 y en paralelo (leer las de todas las compras
 * tardaba 1,6 s). Sin datos o con error, vacío: el portal muestra «—».
 */
export async function cargarConfirmaciones(supabase: SupabaseClient, compraIds: string[]): Promise<Record<string, string>> {
  const tandas: string[][] = [];
  for (let i = 0; i < compraIds.length; i += 100) tandas.push(compraIds.slice(i, i + 100));
  const respuestas = await Promise.all(
    tandas.map((ids) => supabase.from("wms_compra_eventos").select("compra_id, valor_despues, ocurrido_en").eq("campo", "etapa").eq("valor_despues", "produccion").in("compra_id", ids)),
  );
  return fechasDeConfirmacion(respuestas.flatMap((r) => (r.error ? [] : ((r.data ?? []) as { compra_id: string; valor_despues: string | null; ocurrido_en: string }[]))));
}

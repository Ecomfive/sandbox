"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca alertas como vistas: las que se pasan o, sin ids, todas las del país de la barra. */
export async function marcarAlertasVistas(ids?: string[]): Promise<{ error?: string }> {
  await requireModuloEscritura("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  let q = supabase.from("competencia_alertas").update({ vista: true }).eq("pais_id", pais.id).eq("vista", false);
  if (ids) {
    if (!ids.length || ids.length > 500 || !ids.every((i) => UUID.test(i))) return { error: "Selección no válida." };
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) return { error: "No se pudieron marcar las alertas." };
  revalidatePath("/analisis-competencia");
  return {};
}

export interface EventoCompetencia {
  fecha: string;
  evento: string;
  precio: number | null;
  stock: number | null;
  precioAntes: number | null;
  stockAntes: number | null;
}

/** El historial de un producto (para la comparación lado a lado), del más nuevo al más viejo. */
export async function obtenerHistorialCompetencia(productoId: string): Promise<{ eventos?: EventoCompetencia[]; error?: string }> {
  await requireModulo("analisis-competencia");
  if (!UUID.test(productoId)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient()
    .from("competencia_historial")
    .select("fecha, evento, precio, stock, precio_antes, stock_antes")
    .eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) return { error: error.message };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { eventos: (data ?? []).map((e) => ({ fecha: e.fecha, evento: e.evento, precio: n(e.precio), stock: e.stock, precioAntes: n(e.precio_antes), stockAntes: e.stock_antes })) };
}

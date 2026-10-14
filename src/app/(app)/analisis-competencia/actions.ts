"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
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

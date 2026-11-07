"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { getPlataformaActual } from "@/lib/plataforma-actual";
import { createServiceClient } from "@/lib/supabase/server";
import { PAIS_DE_EFFI, sincronizarEffi, type ResumenLecturaEffi } from "@/lib/effi/sincronizar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca alertas como vistas: las que se pasan o, sin ids, todas las del país y la plataforma de la barra. */
export async function marcarAlertasVistas(ids?: string[]): Promise<{ error?: string }> {
  await requireModuloEscritura("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataforma = await getPlataformaActual(pais.codigo);
  const tabla = plataforma === "dropi" ? "competencia_alertas" : `${plataforma}_competencia_alertas`;
  let q = supabase.from(tabla).update({ vista: true }).eq("pais_id", pais.id).eq("vista", false);
  if (ids) {
    if (!ids.length || ids.length > 500 || !ids.every((i) => UUID.test(i))) return { error: "Selección no válida." };
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) return { error: "No se pudieron marcar las alertas." };
  revalidatePath("/analisis-competencia");
  return {};
}

/**
 * «Actualizar nuestros precios desde Effi» (7 nov 2026, pedido de Hernán): la misma lectura de la API que corre cada día, que además pone al día nuestros precios en el análisis. Los de la
 * competencia no están en la API: siguen llegando con la lectura del catálogo. Solo consulta Effi.
 */
export async function actualizarPreciosEffi(): Promise<{ resumen?: ResumenLecturaEffi; error?: string }> {
  await requireModuloEscritura("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (pais.codigo !== PAIS_DE_EFFI) return { error: "Effi es de Costa Rica: elige ese país arriba." };
  try {
    const resumen = await sincronizarEffi(supabase);
    revalidatePath("/analisis-competencia", "layout");
    return { resumen };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer Effi." };
  }
}

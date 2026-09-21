"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";

export interface EventoRetiro {
  id: string;
  evento: string;
  creadoEn: string;
}

/** Cuántos eventos trae la vista rápida: los más recientes; el resto está en la ficha del retiro. */
const MAX_EVENTOS = 30;

/**
 * La actividad de un retiro (cambios de estado, edición, conciliación...) para la vista rápida de la tabla. Es una
 * lectura, así que basta poder abrir Retiros. Devuelve el error como valor, no lo lanza: la vista rápida lo
 * muestra en su sitio sin romper la tabla.
 */
export async function obtenerActividadRetiro(id: string): Promise<{ eventos: EventoRetiro[] } | { error: string }> {
  await requireModulo("retiros");
  // Un id que no parece un id no llega a la base.
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "Retiro no válido." };

  const { data, error } = await createServiceClient()
    .from("retiro_eventos")
    .select("id, evento, creado_en")
    .eq("retiro_id", id)
    .order("creado_en", { ascending: false })
    .limit(MAX_EVENTOS);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: e.evento, creadoEn: e.creado_en })) };
}

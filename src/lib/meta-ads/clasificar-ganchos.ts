// Anuncios Meta › clasificar el gancho de los videos ya analizados (20 nov 2026): el análisis nuevo ya trae el tipo de gancho, pero los videos analizados antes solo tienen el texto del gancho. Aquí se le pide a la IA
// (Gemini, solo con texto: no vuelve a ver el video, cuesta centavos) que lo reparta en la lista fija de `ganchos.ts`. De a 30 por llamada; la pantalla las encadena y muestra el avance.
// Solo lee y escribe en las tablas `meta_*`; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { analizarSoloTextoConGemini, geminiConectado } from "./gemini-video";
import { leerClasificacionGanchos, pedidoClasificarGanchos } from "./ganchos";

export const POR_LLAMADA_GANCHOS = 30;
export const SIN_MIGRACION_GANCHOS = "Falta correr la migración 0338 (tipo de gancho de los videos) en Supabase.";

export interface ResultadoGanchos {
  clasificados: number;
  /** Cuántos faltan después de esta llamada. */
  faltan: number;
  error?: string;
}

/** Clasifica hasta 30 ganchos pendientes de las cuentas dadas. Nunca lanza: lo que pasó se dice en `error`. */
export async function clasificarGanchosPendientes(supabase: SupabaseClient, cuentaIds: string[]): Promise<ResultadoGanchos> {
  if (!cuentaIds.length) return { clasificados: 0, faltan: 0 };
  if (!geminiConectado()) return { clasificados: 0, faltan: 0, error: "Falta conectar Gemini (la clave GEMINI_API_KEY) para clasificar los ganchos." };
  const pendientes = () => supabase.from("meta_video_analisis").select("video_id, gancho, promesa", { count: "exact" }).in("cuenta_id", cuentaIds).not("gancho", "is", null).is("gancho_tipo", null).neq("estado", "error");
  const { data, error, count } = await pendientes().order("analizado_en", { ascending: false }).limit(POR_LLAMADA_GANCHOS);
  if (error) return { clasificados: 0, faltan: 0, error: /gancho_tipo|schema cache|does not exist/i.test(error.message) ? SIN_MIGRACION_GANCHOS : error.message };
  const filas = (data ?? []).filter((f) => String(f.gancho ?? "").trim().length > 0);
  if (!filas.length) return { clasificados: 0, faltan: 0 };
  const items = filas.map((f) => ({ id: String(f.video_id), gancho: String(f.gancho), promesa: (f.promesa as string | null) ?? null }));
  const respuesta = await analizarSoloTextoConGemini(pedidoClasificarGanchos(items), null, { operacion: "meta_gancho_tipo", modulo: "anuncios-meta", referencia: `${items.length} ganchos` });
  if (!("texto" in respuesta)) return { clasificados: 0, faltan: count ?? filas.length, error: respuesta.error };
  const tipos = leerClasificacionGanchos(respuesta.texto, items.map((i) => i.id));
  let clasificados = 0;
  for (const [id, tipo] of tipos) {
    const { error: e } = await supabase.from("meta_video_analisis").update({ gancho_tipo: tipo }).eq("video_id", id);
    if (!e) clasificados++;
  }
  // Los que la IA no supo clasificar (o contestó mal) se vuelven a intentar en la próxima llamada; si ninguno se pudo, se corta para no dar vueltas.
  const faltan = Math.max(0, (count ?? filas.length) - clasificados);
  return { clasificados, faltan, ...(clasificados === 0 ? { error: "La IA no pudo clasificar esos ganchos. Inténtalo de nuevo más tarde." } : {}) };
}

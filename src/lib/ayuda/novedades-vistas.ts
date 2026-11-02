import type { SupabaseClient } from "@supabase/supabase-js";
import { claveNovedad, recientes, sinVer } from "./actualizaciones";
import { novedadesPara } from "./contenido";

/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Las claves de las actualizaciones que la persona ya vio (vacío sin la migración 0218). */
export async function vistasDe(supabase: SupabaseClient, usuarioId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("novedades_vistas").select("clave").eq("usuario_id", usuarioId).limit(5000);
  if (error) return new Set();
  return new Set((data ?? []).map((f) => String(f.clave)));
}

/** Las actualizaciones recientes de los módulos de la persona y cuántas no ha visto (para el contador de Avisos). Sin la migración, 0. */
export async function contarNovedadesSinVer(supabase: SupabaseClient, usuario: { id: string; modulos: string[] }): Promise<number> {
  const { data, error } = await supabase.from("novedades_vistas").select("clave").eq("usuario_id", usuario.id).limit(5000);
  if (error) return 0;
  return sinVer(recientes(novedadesPara(usuario.modulos), hoyPanama()), new Set((data ?? []).map((f) => String(f.clave))));
}

export { claveNovedad };

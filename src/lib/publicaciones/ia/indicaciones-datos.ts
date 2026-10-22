import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAVES_INDICACION, type Indicaciones } from "./criterios";

/** Lo que el equipo le dijo a la IA (Reglas › Indicaciones para la IA). `disponible` es false si falta la migración 0131. */
export async function cargarIndicaciones(supabase: SupabaseClient): Promise<{ indicaciones: Indicaciones; disponible: boolean }> {
  const { data, error } = await supabase.from("dropi_ia_indicaciones").select("clave, texto");
  const indicaciones: Indicaciones = {};
  if (error) return { indicaciones, disponible: false };
  for (const f of data ?? []) if ((CLAVES_INDICACION as readonly string[]).includes(f.clave as string)) indicaciones[f.clave as keyof Indicaciones] = String(f.texto ?? "");
  return { indicaciones, disponible: true };
}

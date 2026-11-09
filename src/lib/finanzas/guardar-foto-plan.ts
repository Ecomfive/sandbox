// Guarda la foto del pronóstico de 18 meses al corte actual (`fin_plan_fotos`, migración 0944). La llaman el cierre de
// mes (al cerrar, en segundo plano) y el botón de Planificación › 18 meses. Sin la migración no hace nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fotoPronosticoActual } from "./cargar-planificacion";

export async function guardarFotoPronostico(supabase: SupabaseClient, usuarioId: string | null): Promise<{ error?: string; periodo?: string }> {
  const r = await fotoPronosticoActual(supabase);
  if ("error" in r) return { error: r.error };
  const { error } = await supabase
    .from("fin_plan_fotos")
    .upsert({ periodo: r.periodo, datos: r.foto, creado_por: usuarioId, creado_en: new Date().toISOString() }, { onConflict: "periodo" });
  if (error) return { error: "Falta correr la migración 0944 (planificación) en Supabase." };
  return { periodo: r.periodo };
}

// Anuncios Meta › ajustes que se cambian desde la pantalla (migración 0347, `meta_ajustes`). Hoy uno: pausar o reanudar el análisis automático de videos (el cron que corre cada 10 minutos).
// Sin la tabla, o sin el ajuste, el análisis automático sigue activo como siempre.

import type { SupabaseClient } from "@supabase/supabase-js";

export const AJUSTE_ANALISIS_AUTOMATICO = "analisis_automatico";

export interface EstadoAnalisisAutomatico {
  activo: boolean;
  /** Quién lo cambió por última vez y cuándo (null si nunca se ha cambiado o falta la tabla). */
  por: string | null;
  en: string | null;
  /** Falta correr la migración 0347: el interruptor no se puede cambiar. */
  sinTabla: boolean;
}

/** Solo un `activo: false` escrito explícitamente lo pausa: un valor ausente o raro deja el análisis corriendo. */
export function interpretarActivo(valor: unknown): boolean {
  return !(valor && typeof valor === "object" && (valor as { activo?: unknown }).activo === false);
}

export async function estadoAnalisisAutomatico(supabase: SupabaseClient): Promise<EstadoAnalisisAutomatico> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor, actualizado_por_nombre, actualizado_en").eq("clave", AJUSTE_ANALISIS_AUTOMATICO).maybeSingle();
    if (error) return { activo: true, por: null, en: null, sinTabla: true };
    return { activo: interpretarActivo(data?.valor), por: (data?.actualizado_por_nombre as string | null) ?? null, en: (data?.actualizado_en as string | null) ?? null, sinTabla: false };
  } catch {
    return { activo: true, por: null, en: null, sinTabla: true };
  }
}

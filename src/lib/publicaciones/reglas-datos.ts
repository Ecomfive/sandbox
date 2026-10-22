import type { SupabaseClient } from "@supabase/supabase-js";
import { REGLAS_DEFECTO, reglasDesde, type Reglas } from "./reglas";

export interface ReglasGuardadas {
  reglas: Reglas;
  /** Quién y cuándo cambió cada regla (solo las que se cambiaron alguna vez). */
  cambios: Record<string, { en: string; por: string | null }>;
  /** false si falta la migración 0127: se usan los valores de siempre y no se pueden guardar. */
  disponible: boolean;
}

/** Las reglas de Gestión de IDs Dropi (migración 0127); sin la tabla, los valores de siempre. */
export async function cargarReglas(supabase: SupabaseClient): Promise<ReglasGuardadas> {
  const { data, error } = await supabase.from("dropi_publicaciones_reglas").select("clave, valor, actualizado_en, actualizado_por_nombre");
  if (error) return { reglas: { ...REGLAS_DEFECTO }, cambios: {}, disponible: false };
  return {
    reglas: reglasDesde(data ?? []),
    cambios: Object.fromEntries((data ?? []).map((f) => [f.clave as string, { en: f.actualizado_en as string, por: (f.actualizado_por_nombre as string | null) ?? null }])),
    disponible: true,
  };
}

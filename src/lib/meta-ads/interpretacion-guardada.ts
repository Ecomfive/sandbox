// Anuncios Meta › Hallazgos: la última interpretación con IA de cada país se guarda en `meta_ajustes` (clave/valor, migración 0347), así no se vuelve a pagar cada vez que se abre la pantalla.
// Sin la tabla, se muestra sin guardar (cada pulsación vuelve a pedirla).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterpretacionIA } from "./interpretar-ia";

export interface InterpretacionGuardada {
  interpretacion: InterpretacionIA;
  modelo: string;
  proveedor: string;
  /** Cuándo se pidió y quién. */
  generadaEn: string;
  por: string | null;
}

export const claveDeInterpretacion = (paisId: string): string => `interpretacion_ia:${paisId}`;

/** La interpretación guardada del país, o null si no hay (o falta la tabla). Nunca lanza. */
export async function leerInterpretacionGuardada(supabase: SupabaseClient, paisId: string): Promise<InterpretacionGuardada | null> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor, actualizado_por_nombre").eq("clave", claveDeInterpretacion(paisId)).maybeSingle();
    if (error || !data?.valor || typeof data.valor !== "object") return null;
    const v = data.valor as Partial<InterpretacionGuardada>;
    if (!v.interpretacion || typeof v.interpretacion.resumen !== "string" || typeof v.generadaEn !== "string") return null;
    return { interpretacion: v.interpretacion, modelo: String(v.modelo ?? ""), proveedor: String(v.proveedor ?? ""), generadaEn: v.generadaEn, por: (data.actualizado_por_nombre as string | null) ?? null };
  } catch {
    return null;
  }
}

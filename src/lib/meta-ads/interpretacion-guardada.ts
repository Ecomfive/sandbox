// Anuncios Meta: la última interpretación con IA de cada país se guarda en `meta_ajustes` (clave/valor, migración 0347), así no se vuelve a pagar cada vez que se abre una pantalla. La hace el sistema solo (cada día,
// con todas las IA que tengan clave: la primera es la principal y la otra, una segunda opinión). Sin la tabla, no se guarda y no se muestra.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterpretacionIA } from "./interpretar-ia";

export interface OpinionIA {
  /** «Claude» u «OpenAI». */
  proveedor: string;
  modelo: string;
  interpretacion: InterpretacionIA;
}

export interface InterpretacionGuardada {
  generadaEn: string;
  /** La principal primero; las demás son segundas opiniones. */
  opiniones: OpinionIA[];
}

export const claveDeInterpretacion = (paisId: string): string => `interpretacion_ia:${paisId}`;

/** Lo que hay guardado, con la forma de antes (una sola interpretación) o la de ahora (varias opiniones). null si no sirve. */
export function leerValorInterpretacion(valor: unknown): InterpretacionGuardada | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.generadaEn !== "string") return null;
  const valida = (i: unknown): i is InterpretacionIA => !!i && typeof i === "object" && typeof (i as { resumen?: unknown }).resumen === "string";
  if (Array.isArray(v.opiniones)) {
    const opiniones = v.opiniones.flatMap((o): OpinionIA[] => {
      const x = o as Record<string, unknown>;
      return valida(x?.interpretacion) ? [{ proveedor: String(x.proveedor ?? ""), modelo: String(x.modelo ?? ""), interpretacion: x.interpretacion }] : [];
    });
    return opiniones.length ? { generadaEn: v.generadaEn, opiniones } : null;
  }
  return valida(v.interpretacion) ? { generadaEn: v.generadaEn, opiniones: [{ proveedor: String(v.proveedor ?? ""), modelo: String(v.modelo ?? ""), interpretacion: v.interpretacion }] } : null;
}

/** La interpretación guardada del país, o null si no hay (o falta la tabla). Nunca lanza. */
export async function leerInterpretacionGuardada(supabase: SupabaseClient, paisId: string): Promise<InterpretacionGuardada | null> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeInterpretacion(paisId)).maybeSingle();
    return error ? null : leerValorInterpretacion(data?.valor);
  } catch {
    return null;
  }
}

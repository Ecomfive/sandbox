// Anuncios Meta › lo que corre cada día con el análisis del historial: mira por dentro los creativos de los productos que más gastan o que empeoran (`senales-creativas.ts`) y deja el resultado guardado en `meta_ajustes`
// (`senales_creativas:<país>`) para Hallazgos, el chat y la IA que interpreta. Solo lee los resultados por día; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarBaseDias } from "./base-dias";
import type { AnalisisHistorico } from "./historico";
import { claveDeSenales, senalesDeProducto, type SenalesCreativas } from "./senales-creativas";

/** Los productos a mirar: los que empeoran (tendencia del CPA a la baja, por gasto) y, para completar, los que más gastan. */
export function productosParaMirar(a: AnalisisHistorico, max = 5): string[] {
  const empeoran = a.tendencias.filter((t) => t.nivel === "Producto" && t.cambio.sentido === "baja").sort((x, y) => y.gastoRec - x.gastoRec).map((t) => t.nombre);
  const masGasto = [...a.entrega].sort((x, y) => y.gasto - x.gasto).map((f) => f.nombre);
  return [...new Set([...empeoran, ...masGasto])].slice(0, max);
}

export async function senalesCreativasDelDia(supabase: SupabaseClient, o: { paisId: string; hoy: string; analisis: AnalisisHistorico }): Promise<SenalesCreativas[]> {
  try {
    const base = await cargarBaseDias({ paisId: o.paisId, cuentaId: null }, supabase);
    if (!base) return [];
    const items = productosParaMirar(o.analisis).map((p) => senalesDeProducto(base, p, o.hoy)).filter((s): s is SenalesCreativas => s !== null);
    await supabase.from("meta_ajustes").upsert({ clave: claveDeSenales(o.paisId), valor: { generadoEn: new Date().toISOString(), items }, actualizado_por_nombre: "Sistema", actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    return items;
  } catch {
    return [];
  }
}

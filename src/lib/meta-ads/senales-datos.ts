// Anuncios Meta › lo que corre cada día con el análisis del historial: mira por dentro los creativos de los productos que más gastan o que empeoran (`senales-creativas.ts`) y deja el resultado guardado en `meta_ajustes`
// (`senales_creativas:<país>`) para Hallazgos, el chat y la IA que interpreta. Solo lee los resultados por día; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarBaseDias } from "./base-dias";
import { hayAlgoEnMarcha, productoEnMarcha } from "./en-marcha";
import type { AnalisisHistorico } from "./historico";
import { claveDeSenales, senalesDeProducto, tieneSenales, type SenalesCreativas } from "./senales-creativas";
import { senalesDeModulos } from "./senales-modulos";
import { leerDatosModulos } from "./senales-modulos-datos";

/** Los productos a mirar: los que empeoran (tendencia del CPA a la baja, por gasto) y, para completar, los que más gastan. */
export function productosParaMirar(a: AnalisisHistorico, max = 5): string[] {
  const empeoran = a.tendencias.filter((t) => t.nivel === "Producto" && t.cambio.sentido === "baja").sort((x, y) => y.gastoRec - x.gastoRec).map((t) => t.nombre);
  const masGasto = [...a.entrega].sort((x, y) => y.gasto - x.gasto).map((f) => f.nombre);
  const e = a.enMarcha;
  return [...new Set([...empeoran, ...masGasto])].filter((p) => !hayAlgoEnMarcha(e) || productoEnMarcha(e, p)).slice(0, max);
}

export async function senalesCreativasDelDia(supabase: SupabaseClient, o: { paisId: string; hoy: string; analisis: AnalisisHistorico }): Promise<SenalesCreativas[]> {
  try {
    const base = await cargarBaseDias({ paisId: o.paisId, cuentaId: null }, supabase);
    if (!base) return [];
    const todos = productosParaMirar(o.analisis).map((p) => senalesDeProducto(base, p, o.hoy)).filter((s): s is SenalesCreativas => s !== null);
    // Lo que pasó con cada producto en Inventario, Gestión de IDs Dropi, Análisis de competencia y Test productos.
    const modulos = await leerDatosModulos(supabase, { paisId: o.paisId, productos: todos.map((s) => s.producto), hoy: o.hoy });
    for (const s of todos) {
      const d = modulos.get(s.producto);
      if (d) s.otras = senalesDeModulos(d, { hoy: o.hoy, cpaActual: s.cpa14 ?? null, gasto14: s.gasto14 });
    }
    // Un producto sin nada que decir (creativos sanos y sin señales de otros módulos) no se guarda ni se muestra ni se le da a la IA.
    const items = todos.filter(tieneSenales);
    await supabase.from("meta_ajustes").upsert({ clave: claveDeSenales(o.paisId), valor: { generadoEn: new Date().toISOString(), items }, actualizado_por_nombre: "Sistema", actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    return items;
  } catch {
    return [];
  }
}

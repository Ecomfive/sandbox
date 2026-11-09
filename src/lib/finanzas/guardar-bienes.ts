// Guarda en Supabase los bienes de uso leídos de la hoja «Bienes de Uso» (ver `bienes-uso.ts`). Lo usan la pantalla
// «Importar Excel» de Bienes de uso y el script `scripts/finanzas/importar-bienes-uso.ts`. Recibe el cliente de
// Supabase: no decide permisos (eso lo hace quien lo llama).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { validarBienExcel } from "./bienes-uso";

export type BienValidado = NonNullable<ReturnType<typeof validarBienExcel>>;

/**
 * Crea o actualiza (por huella) los bienes de un archivo y borra los de ese mismo archivo que ya no vinieron. La baja,
 * la tienda y el valor residual se cargan en el portal y no viajan en el Excel: reimportar no los pisa. Un bien
 * corregido en su ficha (`editado_a_mano`) no se toca ni se borra.
 */
export async function guardarBienes(
  supabase: SupabaseClient,
  origen: string,
  bienes: BienValidado[],
): Promise<{ guardados: number; conservados: number; borrados: number }> {
  const { data, error } = await supabase.from("fin_bienes_uso").select("id, origen_clave, editado_a_mano").eq("origen", origen);
  if (error) throw new Error(error.message);
  const editados = new Set((data ?? []).filter((r) => r.editado_a_mano).map((r) => r.origen_clave as string));
  const aGuardar = bienes.filter((b) => !editados.has(b.origen_clave));
  const ahora = new Date().toISOString();
  for (let i = 0; i < aGuardar.length; i += 400) {
    const { error: e } = await supabase.from("fin_bienes_uso").upsert(
      aGuardar.slice(i, i + 400).map((b) => ({ ...b, origen, actualizado_en: ahora })),
      { onConflict: "origen_clave" },
    );
    if (e) throw new Error(`fin_bienes_uso: ${e.message}`);
  }
  const delArchivo = new Set(bienes.map((b) => b.origen_clave));
  const sobran = (data ?? []).filter((r) => !r.editado_a_mano && !delArchivo.has(r.origen_clave as string)).map((r) => r.id as string);
  // Sin bienes válidos no se borra nada: evita vaciar lo cargado por un envío roto.
  if (bienes.length && sobran.length) {
    const { error: e } = await supabase.from("fin_bienes_uso").delete().in("id", sobran);
    if (e) throw new Error(e.message);
  }
  return { guardados: aGuardar.length, conservados: bienes.length - aGuardar.length, borrados: bienes.length ? sobran.length : 0 };
}

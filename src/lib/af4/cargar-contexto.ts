// Lo que la barra de contexto del Portal AF4 muestra de los datos: cuándo se tocó por última vez el libro. Es igual para
// todos (no depende de la persona) y alcanza con que sea de hace un minuto: se guarda en memoria con `conTtl`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";

/** El último cambio del libro de movimientos (instante ISO), o null sin la migración o sin movimientos. */
export const ultimaActualizacionLibro = conTtl(
  60_000,
  () => "libro",
  async (supabase: SupabaseClient): Promise<string | null> => {
    const { data, error } = await supabase.from("fin_movimientos").select("actualizado_en").order("actualizado_en", { ascending: false }).limit(1);
    if (error || !data?.length) return null;
    return String(data[0].actualizado_en);
  },
);

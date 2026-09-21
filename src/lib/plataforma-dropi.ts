import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";

/** El id de la plataforma «Dropi» no cambia nunca: se pregunta una vez cada diez minutos por instancia, no en cada página. */
const consultarPlataformaDropi = conTtl(
  10 * 60 * 1000,
  () => "dropi",
  async (supabase: SupabaseClient): Promise<string | null> => {
    const { data } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").maybeSingle();
    return data?.id ?? null;
  },
  { esValido: (id) => id !== null }
);

/** Id de la plataforma Dropi, o null si no está en la base. */
export function obtenerPlataformaDropiId(supabase: SupabaseClient): Promise<string | null> {
  return consultarPlataformaDropi(supabase);
}

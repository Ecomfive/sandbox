import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAIS_COOKIE, PAIS_DEFAULT } from "@/lib/nav-data";
import { conTtl } from "@/lib/cache-ttl";

export interface PaisActual {
  id: string;
  codigo: string;
  nombre: string;
}

/** Cada cuánto se vuelve a leer un país de la base: cambian por una decisión de administración, casi nunca. */
const TTL_PAISES_MS = 10 * 60 * 1000;

/** La fila de un país por su código, guardada unos minutos en el proceso (ver `conTtl`); null si no existe. */
const paisPorCodigo = conTtl(
  TTL_PAISES_MS,
  (codigo: string) => codigo,
  async (codigo: string, supabase: SupabaseClient): Promise<PaisActual | null> => {
    const { data } = await supabase.from("paises").select("id, codigo, nombre").eq("codigo", codigo).maybeSingle();
    return data;
  },
  { esValido: (pais) => pais !== null }
);

/** País seleccionado en la barra superior, resuelto contra la tabla `paises`. */
export async function getPaisActual(supabase: SupabaseClient): Promise<PaisActual> {
  const cookieStore = await cookies();
  const codigo = cookieStore.get(PAIS_COOKIE)?.value ?? PAIS_DEFAULT;

  const pais = await paisPorCodigo(codigo, supabase);
  if (pais) return pais;

  const porDefecto = await paisPorCodigo(PAIS_DEFAULT, supabase);
  return porDefecto!;
}

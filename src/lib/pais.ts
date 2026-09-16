import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAIS_COOKIE, PAIS_DEFAULT } from "@/lib/nav-data";

export interface PaisActual {
  id: string;
  codigo: string;
  nombre: string;
}

/** País seleccionado en la barra superior, resuelto contra la tabla `paises`. */
export async function getPaisActual(supabase: SupabaseClient): Promise<PaisActual> {
  const cookieStore = await cookies();
  const codigo = cookieStore.get(PAIS_COOKIE)?.value ?? PAIS_DEFAULT;

  const { data } = await supabase
    .from("paises")
    .select("id, codigo, nombre")
    .eq("codigo", codigo)
    .maybeSingle();

  if (data) return data;

  const { data: fallback } = await supabase
    .from("paises")
    .select("id, codigo, nombre")
    .eq("codigo", PAIS_DEFAULT)
    .single();

  return fallback!;
}

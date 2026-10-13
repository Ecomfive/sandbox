import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAIS_COOKIE, PAIS_DEFAULT, PAISES_NAV } from "@/lib/nav-data";
import { conTtl } from "@/lib/cache-ttl";
import { getUsuarioActual, getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { paisesCandidatos } from "@/lib/paises-permitidos";

export interface PaisActual {
  id: string;
  codigo: string;
  nombre: string;
}

/** Lo que devuelve `getPaisActual` a quien tiene países limitados y ninguno existe: no coincide con ningún dato. */
export const SIN_PAIS: PaisActual = { id: "00000000-0000-0000-0000-000000000000", codigo: "", nombre: "Sin país" };

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

/**
 * El último país que esta persona eligió (`perfiles.pais_preferido`), o null. Solo se consulta cuando el navegador
 * no trae la cookie (otro equipo, cookies borradas), así que la mayoría de las páginas no pagan esta consulta.
 * Si la columna todavía no existe (migración 0038 sin correr) devuelve null y todo sigue como antes.
 */
const paisPreferidoDeLaPersona = cache(async (): Promise<string | null> => {
  try {
    const id = await getUsuarioIdSesion();
    if (!id) return null;
    const { data, error } = await createServiceClient().from("perfiles").select("pais_preferido").eq("id", id).maybeSingle();
    return error ? null : (data?.pais_preferido ?? null);
  } catch {
    return null;
  }
});

/**
 * País seleccionado en la barra superior, resuelto contra la tabla `paises`. Primero manda la cookie de este
 * navegador; sin ella, el último país que la persona eligió en cualquier equipo; y si tampoco hay, Costa Rica.
 */
export async function getPaisActual(supabase: SupabaseClient): Promise<PaisActual> {
  const cookieStore = await cookies();
  const elegido = cookieStore.get(PAIS_COOKIE)?.value ?? (await paisPreferidoDeLaPersona()) ?? PAIS_DEFAULT;
  // Con países limitados (migración 0087), solo uno de los suyos: si el elegido no lo es, el primero que tenga abierto.
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  for (const codigo of paisesCandidatos(elegido, permitidos, PAISES_NAV)) {
    const pais = await paisPorCodigo(codigo, supabase);
    if (pais) return pais;
  }
  // Sin límite, si el elegido no existe, Costa Rica. Con límite y ninguno de sus países en la base, «Sin país»: un id que no
  // es de ningún país, así ninguna página muestra datos de un país que no tiene (auditoría de seguridad, 13 oct 2026).
  if (permitidos === null) {
    const porDefecto = await paisPorCodigo(PAIS_DEFAULT, supabase);
    if (porDefecto) return porDefecto;
  }
  return SIN_PAIS;
}

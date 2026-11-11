// La tienda global de Finanzas (cookie `tienda_actual`, httpOnly): como `getPaisActual`, pero para las tiendas de
// `fin_unidades`. Las reglas puras están en `tienda-elegida.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { conTtl } from "@/lib/cache-ttl";
import { conTiendaGlobal, TIENDA_COOKIE, TODAS_TIENDAS, valorExplicito } from "./tienda-elegida";

export interface Tienda {
  id: string;
  nombre: string;
}

/**
 * Las tiendas activas (clase «tienda»), en su orden. Es igual para todos y casi nunca cambia: se guarda un minuto en
 * memoria. Sin la migración 0900 no hay ninguna (y la barra no muestra el selector).
 */
export const listarTiendas = conTtl(
  60_000,
  () => "tiendas",
  async (supabase: SupabaseClient): Promise<Tienda[]> => {
    const { data, error } = await supabase.from("fin_unidades").select("id, nombre").eq("clase", "tienda").eq("activo", true).order("orden");
    if (error) return [];
    return (data ?? []).map((u) => ({ id: String(u.id), nombre: String(u.nombre) }));
  },
);

/** La tienda elegida en la barra de arriba, o null para «todas» (sin cookie, o si la tienda ya no existe o no es tienda). */
export async function getTiendaActual(supabase: SupabaseClient): Promise<Tienda | null> {
  const valor = (await cookies()).get(TIENDA_COOKIE)?.value;
  if (!valor || valor === TODAS_TIENDAS) return null;
  return (await listarTiendas(supabase)).find((t) => t.id === valor) ?? null;
}

type Params = { [k: string]: string | string[] | undefined };

/**
 * Los parámetros de una página con la tienda global puesta si la dirección no trae una (`clave`: «ver» o «tienda»), y
 * lo que necesita `<RecordarTienda>` para guardar como global la que sí trae.
 */
export async function paramsConTienda<P extends Params>(
  supabase: SupabaseClient,
  params: P,
  clave: string,
): Promise<{ params: P; recordar: { explicito: string | null; global: string | null } }> {
  const global = (await getTiendaActual(supabase))?.id ?? null;
  return { params: conTiendaGlobal(params, clave, global), recordar: { explicito: valorExplicito(params, clave), global } };
}

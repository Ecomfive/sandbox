// La entidad y la moneda que ve una página (migración 0923). Aparte de `cargar-entidades.ts` porque lee el país de la
// barra de arriba (cookies): solo sirve en páginas y rutas del servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaisActual } from "@/lib/pais";
import { cargarEntidades } from "./cargar-entidades";
import { elegirVista, opcionesEntidad, type Entidad, type VistaEntidad } from "./entidades";

export interface ContextoEntidad {
  entidades: Entidad[];
  vista: VistaEntidad;
  opciones: { valor: string; etiqueta: string }[];
}

/**
 * La entidad y la moneda de una página (`?entidad=…&moneda=…`); sin `entidad`, la del país de la barra de arriba. Sin la
 * migración 0923 (o con una sola entidad) es el consolidado en dólares y no se ofrece el selector.
 */
export async function contextoEntidad(
  supabase: SupabaseClient,
  params: { [k: string]: string | string[] | undefined },
): Promise<ContextoEntidad> {
  const entidades = await cargarEntidades(supabase);
  if (entidades.length < 2) return { entidades, vista: { entidad: null, moneda: "USD", local: false }, opciones: [] };
  const pais = await getPaisActual(supabase).catch(() => null);
  const vista = elegirVista(params.entidad, params.moneda, entidades, pais?.codigo ?? null);
  return { entidades, vista, opciones: opcionesEntidad(entidades) };
}

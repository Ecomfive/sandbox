// El fulfillment por pedido de cada país (pedido de Hernán, 31 oct 2026; migración 0208): se cambia en Bodegas y lo usan las publicaciones de
// Gestión de IDs Dropi de ese país (la ficha y «Crear publicación» lo muestran sin dejar escribirlo). null = en ese país se escribe en cada publicación.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillmentFijo } from "./publicacion";

/** El mayor fulfillment que se acepta (la columna admite hasta 999.99). */
export const MAX_FULFILLMENT = 999.99;

/**
 * Lee el valor que se escribió para el fulfillment de un país: vacío = ninguno (se escribe en cada publicación); un número de 0 a `MAX_FULFILLMENT`
 * con hasta dos decimales (acepta coma). Devuelve el error como valor.
 */
export function leerFulfillment(texto: string): { valor: number | null } | { error: string } {
  const t = String(texto ?? "").trim().replace(",", ".").replace(/^\$/, "");
  if (!t) return { valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Escribe el fulfillment en dólares, por ejemplo 2 o 1.50." };
  const valor = Number(t);
  if (!(valor >= 0) || valor > MAX_FULFILLMENT) return { error: `El fulfillment debe estar entre $0 y $${MAX_FULFILLMENT}.` };
  return { valor: Math.round(valor * 100) / 100 };
}

/**
 * El fulfillment por pedido del país (`paises.fulfillment`), o null si en ese país se escribe en cada publicación. Sin la migración 0208, el de
 * antes: $1.50 solo en Panamá.
 */
export async function fulfillmentDePais(supabase: SupabaseClient, paisId: string): Promise<number | null> {
  const { data, error } = await supabase.from("paises").select("codigo, fulfillment").eq("id", paisId).maybeSingle();
  if (error) {
    const { data: p } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
    return fulfillmentFijo((p?.codigo as string | undefined) ?? null);
  }
  if (!data || data.fulfillment === null || data.fulfillment === undefined) return null;
  return Number(data.fulfillment);
}

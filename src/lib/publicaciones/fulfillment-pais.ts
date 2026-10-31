// El fulfillment por pedido de cada país y plataforma (pedido de Hernán, 31 oct 2026; migración 0208; por plataforma, pedido de Alcides, migración
// 0213). Se escribe **en dólares** en Configuración (una fila por plataforma del país) y el de Dropi lo usan las publicaciones de Gestión de IDs Dropi
// de ese país, **pasado a la moneda del país** (colones, pesos) con el tipo de cambio del día: la ficha y «Crear publicación» lo muestran sin dejar
// escribirlo. null = en ese país se escribe en cada publicación.

import type { SupabaseClient } from "@supabase/supabase-js";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
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
 * Un fulfillment en dólares, en la moneda de las publicaciones del país: igual en un país que usa dólares; en otro, por el tipo de cambio
 * (`porUsd`: unidades por 1 dólar), redondeado a unidades enteras (₡1 010, MX$ 37: así no cambia por centavos de un día a otro). null sin tasa.
 */
export function fulfillmentEnMoneda(usd: number, codigoPais: string, porUsd: Record<string, number>): number | null {
  const moneda = monedaDePais(codigoPais);
  if (moneda === "USD") return usd;
  const tasa = porUsd[moneda];
  return tasa && tasa > 0 ? Math.round(usd * tasa) : null;
}

/** El fulfillment del país en dólares (`paises.fulfillment`, el de Dropi), su código y, si falta la migración 0208, el de antes. */
async function fulfillmentUsd(supabase: SupabaseClient, paisId: string): Promise<{ codigo: string; usd: number | null }> {
  const { data, error } = await supabase.from("paises").select("codigo, fulfillment").eq("id", paisId).maybeSingle();
  if (error) {
    const { data: p } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
    const codigo = String(p?.codigo ?? "");
    return { codigo, usd: fulfillmentFijo(codigo || null) };
  }
  return { codigo: String(data?.codigo ?? ""), usd: data?.fulfillment === null || data?.fulfillment === undefined ? null : Number(data.fulfillment) };
}

/**
 * El fulfillment por pedido de Dropi en el país, **en la moneda de sus publicaciones** (en Costa Rica, colones), o null si en ese país se escribe en
 * cada publicación (o no hay tipo de cambio para pasarlo). Sin la migración 0208, el de antes: $1.50 solo en Panamá.
 */
export async function fulfillmentDePais(supabase: SupabaseClient, paisId: string): Promise<number | null> {
  const { codigo, usd } = await fulfillmentUsd(supabase, paisId);
  if (usd === null) return null;
  if (monedaDePais(codigo) === "USD") return usd;
  return fulfillmentEnMoneda(usd, codigo, (await tasasUsd(supabase)).porUsd);
}

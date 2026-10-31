// El fulfillment por pedido de cada país y plataforma (pedido de Hernán, 31 oct 2026; migración 0208; por plataforma y con su moneda, pedido de
// Alcides, migración 0213). Se escribe en Configuración (una fila por plataforma del país) **en la moneda en que lo factura el proveedor** (dólares o
// la del país). El de Dropi lo usan las publicaciones de Gestión de IDs Dropi de ese país: tal cual si está en su moneda; si no, pasado con el tipo
// de cambio del día. La ficha y «Crear publicación» lo muestran sin dejar escribirlo. null = en ese país se escribe en cada publicación.

import type { SupabaseClient } from "@supabase/supabase-js";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { fulfillmentFijo } from "./publicacion";

/** El mayor fulfillment que se acepta (alcanza para colones y pesos; la columna admite hasta 99 999.99). */
export const MAX_FULFILLMENT = 99999.99;

/**
 * Lee el valor que se escribió para un fulfillment: vacío = ninguno (se escribe en cada publicación); un número de 0 a `MAX_FULFILLMENT` con hasta
 * dos decimales (acepta coma y un símbolo de moneda al principio). Devuelve el error como valor.
 */
export function leerFulfillment(texto: string): { valor: number | null } | { error: string } {
  const t = String(texto ?? "").trim().replace(",", ".").replace(/^(US\$|MX\$|\$|₡)\s*/i, "");
  if (!t) return { valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Escribe el fulfillment como un número, por ejemplo 2 o 1.50." };
  const valor = Number(t);
  if (!(valor >= 0) || valor > MAX_FULFILLMENT) return { error: `El fulfillment debe estar entre 0 y ${MAX_FULFILLMENT.toLocaleString("es")}.` };
  return { valor: Math.round(valor * 100) / 100 };
}

/** «US$2.00», «₡1 011», «MX$37»: un monto con su moneda. */
export const montoConMoneda = (n: number | null, moneda: string): string =>
  n === null
    ? "sin dato"
    : moneda === "USD"
      ? `US$${n.toFixed(2)}`
      : `${moneda === "MXN" ? "MX$" : moneda === "CRC" ? "₡" : `${moneda} `}${n.toLocaleString("es-CR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Las monedas en que se puede escribir el fulfillment de un país: dólares y, si es otra, la del país. */
export function monedasFulfillment(codigoPais: string): string[] {
  const local = monedaDePais(codigoPais);
  return local === "USD" ? ["USD"] : ["USD", local];
}

/**
 * Un fulfillment en `moneda`, en la moneda de las publicaciones del país: tal cual si es la misma; si no, por el tipo de cambio (`porUsd`: unidades
 * por 1 dólar). En colones o pesos se redondea a unidades enteras (₡1 011, MX$ 37: así no cambia por centavos de un día a otro); en dólares, a
 * centavos. null si hace falta un tipo de cambio que no hay.
 */
export function fulfillmentEnMoneda(monto: number, moneda: string, codigoPais: string, porUsd: Record<string, number>): number | null {
  const destino = monedaDePais(codigoPais);
  if (moneda === destino) return monto;
  const tasaOrigen = moneda === "USD" ? 1 : porUsd[moneda];
  const tasaDestino = destino === "USD" ? 1 : porUsd[destino];
  if (!tasaOrigen || !tasaDestino) return null;
  const v = (monto / tasaOrigen) * tasaDestino;
  return destino === "USD" ? Math.round(v * 100) / 100 : Math.round(v);
}

/** El fulfillment de Dropi en el país, con su moneda: el de Configuración (migración 0213) o, sin ella, el del país en dólares (0208) o el de antes. */
async function fulfillmentDropi(supabase: SupabaseClient, paisId: string): Promise<{ codigo: string; monto: number | null; moneda: string }> {
  const { data: p } = await supabase.from("paises").select("codigo, fulfillment").eq("id", paisId).maybeSingle();
  const codigo = String(p?.codigo ?? "");
  const { data: filas, error } = await supabase.from("pais_plataformas").select("fulfillment, fulfillment_moneda, plataformas(nombre)").eq("pais_id", paisId);
  if (!error) {
    const dropi = (filas ?? []).find((f) => (f.plataformas as unknown as { nombre: string } | null)?.nombre?.trim().toLowerCase() === "dropi");
    if (dropi) return { codigo, monto: dropi.fulfillment === null || dropi.fulfillment === undefined ? null : Number(dropi.fulfillment), moneda: String(dropi.fulfillment_moneda ?? "USD") };
  }
  if (p && "fulfillment" in p) return { codigo, monto: p.fulfillment === null || p.fulfillment === undefined ? null : Number(p.fulfillment), moneda: "USD" };
  return { codigo, monto: fulfillmentFijo(codigo || null), moneda: "USD" };
}

/**
 * El fulfillment por pedido de Dropi en el país, **en la moneda de sus publicaciones** (en Costa Rica, colones), o null si en ese país se escribe en
 * cada publicación (o no hay tipo de cambio para pasarlo).
 */
export async function fulfillmentDePais(supabase: SupabaseClient, paisId: string): Promise<number | null> {
  const { codigo, monto, moneda } = await fulfillmentDropi(supabase, paisId);
  if (monto === null) return null;
  if (moneda === monedaDePais(codigo)) return monto;
  return fulfillmentEnMoneda(monto, moneda, codigo, (await tasasUsd(supabase)).porUsd);
}

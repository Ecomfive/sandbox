// Las ofertas de Creación de ofertas (en dólares) pasadas a la moneda de la tienda de la landing, con el tipo de cambio del día.
// Las usan la vista previa (página del editor) y el producto de Shopify, para que digan lo mismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import type { OfertaShopify } from "./shopify";

export async function ofertasEnMoneda(supabase: SupabaseClient, seleccionId: string | null, moneda: string): Promise<OfertaShopify[]> {
  if (!seleccionId) return [];
  const [{ data }, tasas] = await Promise.all([
    supabase.from("wms_seleccion_ofertas").select("nombre, unidades, precio").eq("seleccion_id", seleccionId).order("orden"),
    moneda === "USD" ? Promise.resolve(null) : tasasUsd(supabase),
  ]);
  const tasa = moneda === "USD" ? 1 : (tasas?.porUsd[moneda] ?? null);
  return (data ?? []).map((o) => {
    const usd = o.precio === null || o.precio === undefined ? null : Number(o.precio);
    return { nombre: o.nombre as string, unidades: o.unidades as number, precio: usd === null || tasa === null ? null : moneda === "USD" ? usd : Math.round(usd * tasa) };
  });
}

// Conexión de una tienda con Shopify guardada en la base (`ven_tiendas_conexion`, 0956): el token va cifrado con
// `INTEGRACIONES_TOKEN_KEY` (o, si no está, `QBO_TOKEN_KEY`) y nunca sale del servidor. Prueba en `conexion-tienda.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, claveDesdeTexto, descifrar } from "../seguridad/cifrado-tokens";
import type { TiendaShopify } from "../finanzas/shopify";

export const DOMINIO_SHOPIFY = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

/** Acepta `x`, `x.myshopify.com` o la dirección completa del admin y devuelve `x.myshopify.com`, o null. */
export function normalizarDominio(entrada: string): string | null {
  let t = (entrada ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!t) return null;
  if (!t.includes(".")) t = `${t}.myshopify.com`;
  return DOMINIO_SHOPIFY.test(t) ? t : null;
}

/** Los tokens de Admin API de Shopify empiezan por `shpat_` (o `shpca_`/`shppa_`). */
export const tokenPlausible = (t: string) => /^shp(at|ca|pa)_[A-Za-z0-9]{16,}$/.test(t.trim());

export const claveIntegraciones = () => claveDesdeTexto(process.env.INTEGRACIONES_TOKEN_KEY ?? process.env.QBO_TOKEN_KEY);

export function cifrarToken(token: string): string | null {
  const k = claveIntegraciones();
  return k ? cifrar(token.trim(), k) : null;
}

/** Las tiendas conectadas desde el portal, con su token descifrado (solo para el servidor). */
export async function leerConexiones(supabase: SupabaseClient): Promise<(TiendaShopify & { unidadId: string })[]> {
  const k = claveIntegraciones();
  if (!k) return [];
  const { data, error } = await supabase.from("ven_tiendas_conexion").select("unidad_id, dominio, token_cifrado, fin_unidades(nombre)").eq("activo", true);
  if (error || !data) return [];
  return data.flatMap((r) => {
    const u = r.fin_unidades as { nombre: string } | { nombre: string }[] | null;
    const nombre = Array.isArray(u) ? u[0]?.nombre : u?.nombre;
    const token = descifrar(String(r.token_cifrado), k);
    return nombre && token ? [{ tienda: nombre, dominio: String(r.dominio), token, unidadId: String(r.unidad_id) }] : [];
  });
}

// Gestión de tienda y Despacho por tienda (17 nov 2026, pedido de Hernán: «si entra la persona de atención al cliente de Nuvo, solo tiene que salirle lo de
// Nuvo… porque es un cliente»). Usa la misma lista que Finanzas: `perfiles.tiendas_permitidas` (migración 0937, unidades de `fin_unidades`; se elige en
// Usuarios y roles › persona › «Tiendas que ve»). Sin límite no cambia nada. Con límite:
//  - las páginas solo listan esas tiendas y nunca «Todas las tiendas» (`tiendasDeLaPersona`);
//  - cada acción que recibe un id (un pedido, una fila de Despacho, un caso de Cambios, una variante) vuelve a mirar en la base de qué tienda es;
//  - lo que no tiene tienda (una fila de Monday sin tienda reconocida) no se ve.
// Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { SIN_ACCESO_TIENDA, SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { tiendaElegida, type Tienda } from "./datos";
import { mismaTiendaUnidad } from "./ordenes-finanzas";

export { SIN_ACCESO_TIENDA, SOLO_TODA_LA_EMPRESA };

/**
 * Las tiendas del país que la persona puede ver y la elegida en la barra (`?tienda=`). Con límite nunca queda «todas»: sin una de las suyas en la
 * dirección, la primera de las suyas (o ninguna, si no tiene).
 */
export async function tiendasDeLaPersona(
  supabase: SupabaseClient,
  paisId: string,
  param: string | string[] | undefined,
): Promise<{ tiendas: Tienda[]; tienda: Tienda | null; limitado: boolean; faltaMigracion: boolean }> {
  const { tiendas, limitado, faltaMigracion } = await tiendasVisibles(supabase, paisId);
  const tienda = tiendaElegida(tiendas, param) ?? (limitado ? (tiendas[0] ?? null) : null);
  return { tiendas, tienda, limitado, faltaMigracion };
}

/** Las unidades de Finanzas que la persona puede ver (`null` = todas). */
export const unidadesDeLaPersona = cargarTiendasPermitidas;

/** Si la persona tiene tiendas limitadas. */
export async function personaLimitada(): Promise<boolean> {
  return (await cargarTiendasPermitidas()) !== null;
}

/** Error si la persona tiene tiendas limitadas: la acción es de todas las tiendas (configurar, leer SISCORE de cualquier tienda…). */
export async function soloSinLimite(): Promise<string | null> {
  return (await cargarTiendasPermitidas()) ? SOLO_TODA_LA_EMPRESA : null;
}

/** Error si alguna de estas tiendas (`tiendas.id`) no es de la persona. Lee el nombre de la base y lo une con sus unidades como lo hace Finanzas. */
export async function sinAccesoATiendas(supabase: SupabaseClient, tiendaIds: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  const ids = [...new Set(tiendaIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (!ids.length) return tiendaIds.length ? SIN_ACCESO_TIENDA : null;
  if (!permitidas.length) return SIN_ACCESO_TIENDA;
  const [{ data: tiendas, error }, { data: unidades }] = await Promise.all([
    supabase.from("tiendas").select("id, nombre").in("id", ids),
    supabase.from("fin_unidades").select("id, nombre").in("id", permitidas),
  ]);
  if (error) return "No se pudo comprobar la tienda.";
  const nombres = (unidades ?? []).map((u) => u.nombre as string);
  for (const id of ids) {
    const t = (tiendas ?? []).find((x) => x.id === id);
    if (!t || !nombres.some((n) => mismaTiendaUnidad(t.nombre as string, n))) return SIN_ACCESO_TIENDA;
  }
  return null;
}

/** Error si alguna de estas unidades (`fin_unidades.id`; vacía = sin tienda) no es de la persona. */
export async function sinAccesoAUnidadesTienda(unidades: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  return unidades.some((u) => !puedeVerUnidad(permitidas, u ?? null)) ? SIN_ACCESO_TIENDA : null;
}

/** Las tablas de Monday y de Cambios con tienda, con su llave (`item_id`) y su columna de tienda (`unidad_id`). */
type TablaMonday = "mon_despachos" | "mon_postventa";

/** Error si alguna de estas filas (por `item_id`) es de una tienda que la persona no puede ver, o no tiene tienda. Un id que no existe no da error. */
export async function sinAccesoAFilas(supabase: SupabaseClient, tabla: TablaMonday, itemIds: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  const lista = [...new Set(itemIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await supabase.from(tabla).select("item_id, unidad_id").in("item_id", lista.slice(i, i + 500));
    if (error) return "No se pudo comprobar la tienda del registro.";
    for (const f of data ?? []) if (!puedeVerUnidad(permitidas, (f.unidad_id as string | null) ?? null)) return SIN_ACCESO_TIENDA;
  }
  return null;
}

/** Error si alguno de estos pedidos (`ven_ordenes.id`) es de una tienda que la persona no puede ver. */
export async function sinAccesoAOrdenes(supabase: SupabaseClient, ordenIds: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  const lista = [...new Set(ordenIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, unidad_id").in("id", lista.slice(i, i + 500));
    if (error) return "No se pudo comprobar la tienda del pedido.";
    for (const f of data ?? []) if (!puedeVerUnidad(permitidas, (f.unidad_id as string | null) ?? null)) return SIN_ACCESO_TIENDA;
  }
  return null;
}

/** Error si este pedido de Shopify directo (`tienda_pedidos.id`) es de una tienda que la persona no puede ver. */
export async function sinAccesoAPedidoShopify(supabase: SupabaseClient, pedidoId: string): Promise<string | null> {
  if (!(await cargarTiendasPermitidas())) return null;
  const { data } = await supabase.from("tienda_pedidos").select("tienda_id").eq("id", pedidoId).maybeSingle();
  return data ? sinAccesoATiendas(supabase, [data.tienda_id as string]) : null;
}

// Comprobación en el servidor de las tiendas permitidas (`perfiles.tiendas_permitidas`, migración 0937) en las acciones
// financieras que reciben el id de un registro con tienda (un movimiento del libro, una orden de ventas, un documento de
// cartera, un bien de uso, una entrega de un repartidor…). La página ya filtra lo que se ve, pero una acción se puede
// llamar con cualquier id: aquí se vuelve a mirar la tienda del registro en la base, nunca la que mande el navegador.
// Sin límite (o sin la migración) no cambia nada. Las reglas puras viven en `tiendas-permitidas.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarTiendasPermitidas } from "./cargar-tiendas-permitidas";
import { puedeVerUnidad, unidadesFueraDePermiso } from "./tiendas-permitidas";

export const SIN_ACCESO_TIENDA = "No tienes acceso a esa tienda.";
export const SOLO_TODA_LA_EMPRESA = "Solo quien ve todas las tiendas puede hacer esto.";

/** Las tablas con tienda que tocan las acciones financieras (columna de la tienda en cada una). */
export const COLUMNA_TIENDA = {
  fin_movimientos: "unidad_id",
  ven_ordenes: "unidad_id",
  fin_cartera: "unidad_id",
  fin_bienes_uso: "unidad_id",
  del_entregas: "unidad_id",
  fin_reglas: "unidad_id",
  mkt_meta_reglas: "unidad_id",
  mkt_meta_campanas: "unidad_id",
} as const;
export type TablaConTienda = keyof typeof COLUMNA_TIENDA;

/** Error si la persona tiene tiendas limitadas y alguna de estas (un id o null = sin tienda) no es suya. */
export async function sinAccesoAUnidades(unidades: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  return unidadesFueraDePermiso(permitidas, unidades).length ? SIN_ACCESO_TIENDA : null;
}

/** Error si la persona tiene tiendas limitadas: la acción es de toda la empresa (aplicar reglas a todo el libro…). */
export async function sinAccesoTodaLaEmpresa(): Promise<string | null> {
  return (await cargarTiendasPermitidas()) ? SOLO_TODA_LA_EMPRESA : null;
}

/**
 * Error si alguno de los registros (por id) es de una tienda que la persona no puede ver. Lee la tienda de la base; un
 * id que no existe no da error aquí (la acción dirá que ya no existe). Con más de 1 000 ids lee por tandas.
 */
export async function sinAccesoARegistros(supabase: SupabaseClient, tabla: TablaConTienda, ids: (string | null | undefined)[]): Promise<string | null> {
  const permitidas = await cargarTiendasPermitidas();
  if (!permitidas) return null;
  const lista = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (!lista.length) return null;
  const columna = COLUMNA_TIENDA[tabla];
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await supabase.from(tabla).select(`id, ${columna}`).in("id", lista.slice(i, i + 500));
    if (error) return "No se pudo comprobar la tienda del registro.";
    for (const f of (data ?? []) as unknown as Record<string, string | null>[]) {
      if (!puedeVerUnidad(permitidas, f[columna])) return SIN_ACCESO_TIENDA;
    }
  }
  return null;
}

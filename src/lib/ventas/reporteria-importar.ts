// Reportería de pedidos (17 nov 2026, pedido de Hernán): la carga de la Matriz de administración («NUEVA GESTION OCEANS PANAMA», hoja «Excel Matriz»)
// al sistema. La primera carga trae todo lo que hay por fuera; mientras el equipo siga llenando el Excel se puede repetir (es seguro: no duplica ni
// borra), y cuando trabajen solo en el sistema deja de usarse. Lo usan el script `scripts/finanzas/importar-ventas.ts --reporteria`, el botón
// «Actualizar desde la Matriz» de la Reportería y el importador de Ventas por tienda. Recibe el cliente de Supabase: los permisos los revisa quien llama.
//
// Cómo se junta con lo que ya hay (la llave de una orden es la misma en Shopify y en la Matriz: tienda + número):
// - Pedido nuevo, o que vino del Excel: se guarda completo (`guardarLoteOrdenes`, que no deja volver atrás lo que el sistema ya cerró).
// - Pedido que llegó de Shopify: NO se reescribe (sus líneas tienen el producto nuestro unido y su estado lo llevan Shopify, Monday y Servientrega):
//   solo se le completa lo que anota la Matriz — el costo de cada línea, la provincia, la forma de pago real y las columnas de administración.
// - Lo que alguien editó a mano en la Reportería (`ven_orden_ediciones`) gana siempre: no lo pisa ni el guardado completo ni las columnas en bloque.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarVinculosDeOrdenes } from "../tienda/productos-shopify";
import { guardarLoteOrdenes } from "./guardar";
import type { OrdenVenta } from "./matriz";
import { EDITABLES } from "./reporteria";

export const ORIGEN_MATRIZ = "Excel Matriz";

export interface ResultadoMatriz {
  nuevas: number;
  actualizadas: number;
  sinCambios: number;
  /** Pedidos que ya venían de Shopify y solo se completaron. */
  completadas: number;
  /** Pedidos a los que se les escribieron las columnas de administración. */
  conColumnas: number;
  tiendasNuevas: string[];
}

const COLUMNAS_EDITABLES = EDITABLES.map((e) => e.columna);

/**
 * Guarda un lote. `vincular: false` (la carga grande del script) no vuelve a unir las líneas reescritas con el producto nuestro en cada lote: lo hace
 * una sola vez por tienda al final (`aplicarVinculosDeTienda`), que es mucho más rápido que hacerlo lote por lote.
 */
export async function guardarLoteMatriz(supabase: SupabaseClient, ordenes: OrdenVenta[], { vincular = true }: { vincular?: boolean } = {}): Promise<ResultadoMatriz> {
  if (!ordenes.length) return { nuevas: 0, actualizadas: 0, sinCambios: 0, completadas: 0, conColumnas: 0, tiendasNuevas: [] };
  const claves = ordenes.map((o) => o.origen_clave);
  const previa = new Map<string, { id: string; origen: string }>();
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, origen_clave, origen").in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const r of data ?? []) previa.set(r.origen_clave as string, { id: r.id as string, origen: r.origen as string });
  }

  // Lo editado a mano en los que ya existen: qué columnas y, para los que se guardan completos, su valor de ahora (para reponerlo).
  const fijos = new Map<string, string[]>();
  const existentes = [...previa.values()].map((p) => p.id);
  for (let i = 0; i < existentes.length; i += 200) {
    const { data, error } = await supabase.from("ven_orden_ediciones").select("orden_id, campo").in("orden_id", existentes.slice(i, i + 200));
    if (error) throw new Error(`ven_orden_ediciones: ${error.message}`);
    for (const e of data ?? []) fijos.set(e.orden_id as string, [...new Set([...(fijos.get(e.orden_id as string) ?? []), e.campo as string])]);
  }
  const deShopify = ordenes.filter((o) => previa.get(o.origen_clave)?.origen === "shopify");
  const completas = ordenes.filter((o) => previa.get(o.origen_clave)?.origen !== "shopify");
  const aReponer = completas.map((o) => previa.get(o.origen_clave)?.id).filter((id): id is string => !!id && fijos.has(id));
  const valoresEditados = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < aReponer.length; i += 100) {
    const { data } = await supabase.from("ven_ordenes").select(`id, metodo_pago, costo_envio, ${COLUMNAS_EDITABLES.join(", ")}`).in("id", aReponer.slice(i, i + 100));
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) valoresEditados.set(r.id as string, r);
  }

  // 1) Nuevos y los que vinieron del Excel: completos. Sus líneas se reescriben, así que después vuelven a tomar el producto nuestro unido.
  const r = await guardarLoteOrdenes(supabase, ORIGEN_MATRIZ, completas);
  if (vincular && r.nuevas + r.actualizadas > 0) await aplicarVinculosDeOrdenes(supabase, completas.map((o) => o.origen_clave));
  for (const [id, v] of valoresEditados) {
    const cambio: Record<string, unknown> = {};
    for (const c of fijos.get(id) ?? []) if (c in v) cambio[c] = v[c];
    if (cambio.forma_pago_texto !== undefined) cambio.metodo_pago = v.metodo_pago;
    if (cambio.monto_envio !== undefined || cambio.monto_envio_se !== undefined) cambio.costo_envio = v.costo_envio;
    if (Object.keys(cambio).length) await supabase.from("ven_ordenes").update(cambio).eq("id", id);
  }

  // Los id de todas (también las nuevas), para las columnas de administración.
  const idDe = new Map([...previa].map(([k, p]) => [k, p.id]));
  const faltan = claves.filter((k) => !idDe.has(k));
  for (let i = 0; i < faltan.length; i += 100) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, origen_clave").in("origen_clave", faltan.slice(i, i + 100));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const x of data ?? []) idDe.set(x.origen_clave as string, x.id as string);
  }

  // 2) Los de Shopify: el costo de cada línea (si la Matriz trae las mismas líneas), la provincia y la forma de pago real, sin tocar lo demás.
  const lineasDe = new Map<string, { linea: number; costo_excel: number | null }[]>();
  const idsShopify = deShopify.map((o) => idDe.get(o.origen_clave)).filter((x): x is string => !!x);
  for (let i = 0; i < idsShopify.length; i += 200) {
    const { data, error } = await supabase.from("ven_orden_lineas").select("orden_id, linea, costo_excel").in("orden_id", idsShopify.slice(i, i + 200));
    if (error) throw new Error(`ven_orden_lineas: ${error.message}`);
    for (const l of data ?? []) lineasDe.set(l.orden_id as string, [...(lineasDe.get(l.orden_id as string) ?? []), { linea: l.linea as number, costo_excel: l.costo_excel as number | null }]);
  }
  // La forma de pago se agrupa (muchos pedidos dicen lo mismo): una escritura por forma de pago, no por pedido.
  const porFormaPago = new Map<string, { forma: string; metodo: string; ids: string[] }>();
  for (const o of deShopify) {
    const id = idDe.get(o.origen_clave);
    if (!id) continue;
    const ls = lineasDe.get(id);
    if (ls && ls.length === o.lineas.length)
      for (const l of o.lineas)
        if (l.costo_excel !== null && ls.find((x) => x.linea === l.linea)?.costo_excel == null)
          await supabase.from("ven_orden_lineas").update({ costo_excel: l.costo_excel }).eq("orden_id", id).eq("linea", l.linea);
    if (o.cliente.provincia) await supabase.from("ven_ordenes_clientes").update({ provincia: o.cliente.provincia }).eq("orden_id", id).is("provincia", null);
    if (o.metodo_pago && o.forma_pago_texto && !(fijos.get(id) ?? []).includes("forma_pago_texto")) {
      const k = `${o.forma_pago_texto}|${o.metodo_pago}`;
      const g = porFormaPago.get(k) ?? { forma: o.forma_pago_texto, metodo: o.metodo_pago, ids: [] };
      g.ids.push(id);
      porFormaPago.set(k, g);
    }
  }
  for (const g of porFormaPago.values())
    for (let i = 0; i < g.ids.length; i += 200) await supabase.from("ven_ordenes").update({ forma_pago_texto: g.forma, metodo_pago: g.metodo }).in("id", g.ids.slice(i, i + 200));

  // 3) Las columnas de administración de todas, sin pisar lo editado a mano.
  const datos = ordenes.flatMap((o) => {
    const id = idDe.get(o.origen_clave);
    if (!id || !o.matriz) return [];
    return [
      {
        id,
        fijos: fijos.get(id) ?? [],
        ...o.matriz,
        facturado: o.facturado || null,
        factura_numero: o.factura_numero,
        mes_gestion: o.mes_gestion,
        motivo_cancelacion: o.motivo_cancelacion,
      },
    ];
  });
  let conColumnas = 0;
  for (let i = 0; i < datos.length; i += 500) {
    const { data, error } = await supabase.rpc("ven_reporteria_aplicar", { datos: datos.slice(i, i + 500) });
    if (error) throw new Error(/ven_reporteria_aplicar|function/.test(error.message) ? "Falta correr la migración 0310 (Reportería de pedidos) en Supabase." : `ven_reporteria_aplicar: ${error.message}`);
    conColumnas += Number(data ?? 0);
  }
  return { nuevas: r.nuevas, actualizadas: r.actualizadas, sinCambios: r.sinCambios, completadas: deShopify.length, conColumnas, tiendasNuevas: r.tiendasNuevas };
}

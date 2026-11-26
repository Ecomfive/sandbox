// Lleva a la hoja de Costos de producto las compras de Panamá que están En Bodega o Completado (migración 0992). Una fila
// por compra y producto, sin duplicar (`origen_clave` = `compra:<compra>:<producto>`): actualiza lo que viene de Compras
// (código, unidades, costo de compra, fecha de llegada, financiamiento) y nunca toca los costos asociados ni el costo
// final manual que ya cargaron Francis o María José. Si una compra deja de estar En Bodega o Completado (se reabrió, se
// anuló), su fila se quita, salvo que ya tenga costos asociados o costo final manual: esa queda marcada para revisar.
// Lo llaman Compras (al cambiar la etapa), «Traer las compras» de la hoja, «Usar como costo oficial» de Compras y costos y
// la tarea diaria de alertas. Solo Panamá: el resto de países no entra en la hoja. Sin permisos: los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarComprasCostos } from "./cargar-compras-costos";
import { normalizar } from "./clasificacion";
import { costoPuestoCompras } from "./compras-costos";
import { conFinanciamiento, financiamientoPorOrden } from "./financiamiento-orden";
import { ETAPAS_HOJA, ORIGEN_HOJA_COMPRAS, filasDesdeCompras } from "./hoja-costos";

export const PAIS_HOJA_COSTOS = "PA";

export async function sincronizarCostosCompras(
  supabase: SupabaseClient,
  hoy: string,
  codigoPais: string = PAIS_HOJA_COSTOS,
): Promise<{ error: string } | { lotes: number; quitados: number }> {
  // La hoja es solo de Panamá: otro país no agrega nada.
  if (codigoPais !== PAIS_HOJA_COSTOS) return { lotes: 0, quitados: 0 };
  const datos = await cargarComprasCostos(supabase, hoy, PAIS_HOJA_COSTOS);
  if ("error" in datos) return datos;

  const enHoja = datos.compras.filter((c) => ETAPAS_HOJA.has(c.etapa));
  // Las ventas de importación (servicio a un cliente) no son mercancía nuestra; y la fecha de entrada a la etapa sirve de
  // llegada a las compras que todavía no la tienen.
  const extra = new Map<string, { desde: string | null; importacion: boolean }>();
  const ids = enHoja.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("wms_compras").select("id, etapa_desde, venta_importacion").in("id", ids.slice(i, i + 200));
    if (error) break;
    for (const d of data ?? []) extra.set(String(d.id), { desde: typeof d.etapa_desde === "string" ? d.etapa_desde.slice(0, 10) : null, importacion: d.venta_importacion === true });
  }
  const propias = enHoja.filter((c) => !extra.get(c.id)?.importacion);
  const costoPuesto = costoPuestoCompras(propias, datos.items, [], new Map(), datos.nombres);
  const costos = conFinanciamiento(costoPuesto, financiamientoPorOrden(datos.movsGrupo, datos.tasas, new Map(costoPuesto.map((c) => [c.codigo, c.fob])), hoy));
  const fechaEtapa = new Map([...extra].filter(([, v]) => v.desde).map(([k, v]) => [k, v.desde!]));

  // La clave de un producto que ya tenía lotes se respeta: así su historial y su mapeo con Dropi siguen.
  const claveSku = new Map<string, string>();
  for (const l of datos.lotes) if (l.skuId && !claveSku.has(l.skuId)) claveSku.set(l.skuId, l.productoClave);
  const filas = filasDesdeCompras(costos, fechaEtapa, (sku, producto) => claveSku.get(sku) ?? normalizar(producto));

  const ahora = new Date().toISOString();
  for (let i = 0; i < filas.length; i += 300) {
    const { error } = await supabase
      .from("fin_costos_lotes")
      .upsert(filas.slice(i, i + 300).map((f) => ({ ...f, origen: ORIGEN_HOJA_COMPRAS, actualizado_en: ahora })), { onConflict: "origen_clave" });
    if (error) return { error: `No se pudieron guardar los costos: ${error.message}` };
  }

  // Las filas de compras que ya no están En Bodega o Completado.
  const vigentes = new Set(filas.map((f) => f.origen_clave));
  const { data: actuales, error: errActuales } = await supabase
    .from("fin_costos_lotes")
    .select("id, origen_clave, costo_final_manual, asoc_comision_banco_1, asoc_comision_banco_2, asoc_comision_cambio, asoc_impuesto, asoc_envio, asoc_otros")
    .eq("origen", ORIGEN_HOJA_COMPRAS)
    .eq("en_hoja_costos", true)
    .limit(20000);
  if (errActuales) return { lotes: filas.length, quitados: 0 };
  let quitados = 0;
  const borrar: string[] = [];
  const revisar: string[] = [];
  for (const a of actuales ?? []) {
    if (vigentes.has(String(a.origen_clave))) continue;
    const conDatos =
      a.costo_final_manual !== null ||
      [a.asoc_comision_banco_1, a.asoc_comision_banco_2, a.asoc_comision_cambio, a.asoc_impuesto, a.asoc_envio, a.asoc_otros].some((v) => Number(v) > 0);
    (conDatos ? revisar : borrar).push(String(a.id));
  }
  for (let i = 0; i < borrar.length; i += 200) {
    const { error } = await supabase.from("fin_costos_lotes").delete().in("id", borrar.slice(i, i + 200));
    if (!error) quitados += Math.min(200, borrar.length - i);
  }
  for (let i = 0; i < revisar.length; i += 200)
    await supabase.from("fin_costos_lotes").update({ estatus: "Revisar: la compra ya no está En Bodega ni Completado" }).in("id", revisar.slice(i, i + 200));
  return { lotes: filas.length, quitados };
}

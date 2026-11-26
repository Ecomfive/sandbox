// Lleva a la hoja de Costos de producto las compras de Panamá que están En Bodega o Completado (migración 0992). Una fila
// por compra y producto, sin duplicar (`origen_clave` = `compra:<compra>:<producto>`): actualiza lo que viene de Compras
// (código, unidades, costo de compra, fecha de llegada, financiamiento) y nunca toca los costos asociados ni el costo
// final manual que ya cargaron Francis o María José. Si una compra deja de estar En Bodega o Completado (se reabrió, se
// anuló), su fila se quita, salvo que ya tenga costos asociados o costo final manual: esa queda marcada para revisar.
// Lo llaman Compras (al cambiar la etapa), «Traer las compras» de la hoja, «Usar como costo oficial» de Compras y costos y
// la tarea diaria de alertas. Solo Panamá: el resto de países no entra en la hoja. Sin permisos: los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarComprasCostos } from "./cargar-compras-costos";
import { normalizar } from "./clasificacion";
import { costoPuestoCompras } from "./compras-costos";
import { codigoOrden, financiamientoPorOrden, type FinanciamientoOrden } from "./financiamiento-orden";
import { COSTOS_ASOCIADOS, ETAPAS_HOJA, ORIGEN_HOJA_COMPRAS, filasDesdeCompras, paresCargaInicial } from "./hoja-costos";

export const PAIS_HOJA_COSTOS = "PA";

const COLS_ASOC = COSTOS_ASOCIADOS.map((c) => c.id);

type Existente = Record<string, unknown> & { id: string; origen_clave: string };

export async function sincronizarCostosCompras(
  supabase: SupabaseClient,
  hoy: string,
  codigoPais: string = PAIS_HOJA_COSTOS,
): Promise<{ error: string } | { lotes: number; quitados: number; unidas: number }> {
  // La hoja es solo de Panamá: otro país no agrega nada.
  if (codigoPais !== PAIS_HOJA_COSTOS) return { lotes: 0, quitados: 0, unidas: 0 };
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
  const fechaEtapa = new Map([...extra].filter(([, v]) => v.desde).map(([k, v]) => [k, v.desde!]));

  // Financiamiento: lo cobrado por el financista vale siempre; lo estimado se calcula hasta el día en que la compra llegó
  // (no sigue creciendo con los días: así el costo de lo ya vendido no cambia solo).
  const fob = new Map(costoPuesto.map((c) => [c.codigo, c.fob]));
  const porFecha = new Map<string, Map<string, FinanciamientoOrden>>();
  const finDe = (codigo: string, llegada: string | null) => {
    const corte = llegada && llegada < hoy ? llegada : hoy;
    let m = porFecha.get(corte);
    if (!m) porFecha.set(corte, (m = financiamientoPorOrden(datos.movsGrupo, datos.tasas, fob, corte)));
    const f = m.get(codigoOrden(codigo));
    return f && f.total > 0 ? f : null;
  };
  const costos = costoPuesto.map((c) => ({ ...c, financiamiento: finDe(c.codigo, c.fechaLlegada ?? fechaEtapa.get(c.compraId) ?? null) }));

  // La clave de un producto que ya tenía lotes se respeta: así su historial y su mapeo con Dropi siguen.
  const claveSku = new Map<string, string>();
  for (const l of datos.lotes) if (l.skuId && !claveSku.has(l.skuId)) claveSku.set(l.skuId, l.productoClave);
  const filas = filasDesdeCompras(costos, fechaEtapa, (sku, producto) => claveSku.get(sku) ?? normalizar(producto));

  // Lo que ya está en la hoja (por páginas: Supabase entrega como mucho 1000 filas por consulta).
  const actualesR = await traerTodasConError<Existente>((d, h) =>
    supabase
      .from("fin_costos_lotes")
      .select(`id, origen, origen_clave, sku_maestro_id, linea, financiamiento, financiamiento_tipo, financiamiento_fijado_en, costo_final_manual, costo_final_excel, asoc_nota, ${COLS_ASOC.join(", ")}`)
      .eq("en_hoja_costos", true)
      .in("origen", [ORIGEN_HOJA_COMPRAS, "carga_inicial"])
      .order("id")
      .range(d, h) as unknown as PromiseLike<{ data: Existente[] | null; error: unknown }>,
  );
  if (actualesR.error) return { error: "No se pudo leer la hoja de costos (¿falta la migración 0992?)." };
  const actuales = actualesR.data ?? [];
  const porClave = new Map(actuales.filter((a) => a.origen === ORIGEN_HOJA_COMPRAS).map((a) => [a.origen_clave, a]));

  // Un estimado ya guardado queda congelado: solo cambia si el financista cobra (pasa a real).
  const ahora = new Date().toISOString();
  const aGuardar = filas.map((f) => {
    const previa = porClave.get(f.origen_clave);
    let financiamiento = f.financiamiento;
    let fijado: string | null = null;
    if (f.financiamiento_tipo === "estimado") {
      if (previa?.financiamiento_tipo === "estimado") {
        financiamiento = Number(previa.financiamiento ?? f.financiamiento);
        fijado = (previa.financiamiento_fijado_en as string | null) ?? hoy;
      } else fijado = hoy;
    }
    return { ...f, financiamiento, financiamiento_fijado_en: fijado, origen: ORIGEN_HOJA_COMPRAS, actualizado_en: ahora };
  });
  for (let i = 0; i < aGuardar.length; i += 300) {
    const { error } = await supabase.from("fin_costos_lotes").upsert(aGuardar.slice(i, i + 300), { onConflict: "origen_clave" });
    if (error) return { error: `No se pudieron guardar los costos: ${error.message}` };
  }

  // La carga inicial que no encontró su compra y que ahora tiene su fila de Compras: se une a esa fila (con lo que María
  // José ya le cargó) y se quita, para no contar la compra dos veces.
  let unidas = 0;
  const pares = paresCargaInicial(
    actuales.filter((a) => a.origen === "carga_inicial").map((a) => ({ id: a.id, skuId: String(a.sku_maestro_id), codigo: String(a.linea ?? ""), fila: a })),
    filas.map((f) => ({ clave: f.origen_clave, skuId: f.sku_maestro_id, codigo: f.linea })),
  );
  for (const { carga, compra } of pares) {
    const previa = porClave.get(compra.clave);
    const tieneDatos = (r: Record<string, unknown> | undefined) => !!r && (r.costo_final_manual !== null || COLS_ASOC.some((c) => Number(r[c]) > 0));
    const cambio: Record<string, unknown> = {};
    if (!tieneDatos(previa)) {
      for (const c of COLS_ASOC) cambio[c] = Number(carga.fila[c] ?? 0);
      cambio.costo_final_manual = carga.fila.costo_final_manual ?? null;
      cambio.costo_final_excel = carga.fila.costo_final_excel === true;
      cambio.asoc_nota = carga.fila.asoc_nota ?? null;
    }
    if (Object.keys(cambio).length) {
      const { error } = await supabase.from("fin_costos_lotes").update(cambio).eq("origen_clave", compra.clave);
      if (error) continue;
    }
    const { error } = await supabase.from("fin_costos_lotes").delete().eq("id", carga.id).eq("origen", "carga_inicial");
    if (!error) unidas++;
  }

  // Las filas de compras que ya no están En Bodega o Completado.
  const vigentes = new Set(filas.map((f) => f.origen_clave));
  let quitados = 0;
  const borrar: string[] = [];
  const revisar: string[] = [];
  for (const a of actuales) {
    if (a.origen !== ORIGEN_HOJA_COMPRAS || vigentes.has(a.origen_clave)) continue;
    const conDatos = a.costo_final_manual !== null || COLS_ASOC.some((c) => Number(a[c]) > 0);
    (conDatos ? revisar : borrar).push(a.id);
  }
  for (let i = 0; i < borrar.length; i += 200) {
    const { error } = await supabase.from("fin_costos_lotes").delete().in("id", borrar.slice(i, i + 200));
    if (!error) quitados += Math.min(200, borrar.length - i);
  }
  for (let i = 0; i < revisar.length; i += 200)
    await supabase.from("fin_costos_lotes").update({ estatus: "Revisar: la compra ya no está En Bodega ni Completado" }).in("id", revisar.slice(i, i + 200));
  return { lotes: filas.length, quitados, unidas };
}

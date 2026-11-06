"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { indexar, parecidos, todasLasCoincidencias } from "@/lib/scraping/cruces";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { revisarCajas } from "@/lib/wms/cajas";
import { MAX_LINEAS_IMPORTADAS, revisarConteo, varianteDeLinea } from "@/lib/wms/levantamiento";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/**
 * Guarda un levantamiento (conteo físico) de una bodega propia: cada producto contado queda en lo contado y la diferencia
 * se anota como ajuste (`wms_registrar_conteo`, migración 0214). Devuelve el error como valor.
 */
export async function guardarLevantamiento(
  bodegaId: string,
  referencia: string,
  items: unknown,
  /** Las cajas de los productos que se tocaron (migración 0235): deben sumar lo que queda en la bodega. */
  cajas?: unknown,
): Promise<{ error?: string; productos?: number; ajustes?: number; cajas?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisadasCajas = revisarCajas(cajas);
  if ("error" in revisadasCajas) return { error: revisadasCajas.error };
  const soloCajas = revisadasCajas.cajas.length > 0 && Array.isArray(items) && items.length === 0;
  const revisado = soloCajas ? { items: [] } : revisarConteo(items);
  if ("error" in revisado) return { error: revisado.error };
  const ref = referencia.replace(/\s+/g, " ").trim().slice(0, 120);

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  const conCajas = revisadasCajas.cajas.length > 0;
  const { data, error } = conCajas
    ? await supabase.rpc("wms_registrar_conteo_cajas", { p_bodega: bodegaId, p_items: revisado.items, p_cajas: revisadasCajas.cajas, p_referencia: ref || null, p_usuario: usuario.id })
    : await supabase.rpc("wms_registrar_conteo", { p_bodega: bodegaId, p_items: revisado.items, p_referencia: ref || null, p_usuario: usuario.id });
  if (error) {
    if (/wms_registrar_conteo_cajas/.test(error.message)) return { error: "Falta correr la migración 0235 en la base." };
    if (/wms_registrar_conteo/.test(error.message)) return { error: "Falta correr la migración 0214 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo guardar el levantamiento." };
  }
  const r = (data ?? {}) as { productos?: number; ajustes?: number; cajas?: number };
  await registrarAuditoria({
    accion: "levantamiento_inventario",
    entidad: "wms_bodegas",
    entidadId: bodegaId,
    detalle: `Levantamiento${ref ? ` «${ref}»` : ""}: ${r.productos ?? 0} productos contados, ${r.ajustes ?? 0} con diferencia${r.cajas ? `, cajas de ${r.cajas} productos` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/levantamiento");
  revalidatePath("/inventario/remisiones");
  return { productos: r.productos ?? 0, ajustes: r.ajustes ?? 0, cajas: r.cajas ?? 0 };
}

export interface SugerenciaLinea {
  /** El producto elegido de entrada (null si no se encontró ninguno). */
  skuId: string | null;
  /** «seguro»: el SKU o el nombre calzan; «revisar»: se parece pero conviene mirarlo; «sin»: no se encontró. */
  estado: "seguro" | "revisar" | "sin";
  /** Otros productos parecidos para elegir (el primero es el sugerido). */
  opciones: { id: string; codigo: string; nombre: string }[];
}

const normal = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Para «Importar lista» del levantamiento: busca el producto de cada línea (por SKU, por nombre igual o por parecido del nombre,
 * el mismo cruce de Testing Lab) entre los productos simples que no están en Test ni tienen variantes (se cuenta cada variante). No guarda nada.
 */
export async function sugerirProductosParaLista(nombres: string[]): Promise<{ sugerencias: SugerenciaLinea[] } | { error: string }> {
  await requireModulo("inventario");
  if (!Array.isArray(nombres) || nombres.length === 0) return { error: "La lista está vacía." };
  if (nombres.length > MAX_LINEAS_IMPORTADAS) return { error: `Son demasiadas líneas (máximo ${MAX_LINEAS_IMPORTADAS}).` };
  const supabase = createServiceClient();
  const { data, error } = await traerTodasConError<{ id: string; codigo: string; nombre: string; padre_id: string | null; opciones: Record<string, string> | null }>((d, h) =>
    supabase.from("skus_maestros").select("id, codigo, nombre, padre_id, opciones").neq("tipo", "combo").neq("clase", "test").is("opciones_variantes", null).order("codigo").range(d, h),
  );
  if (error || !data) return { error: "No se pudieron cargar los productos." };
  const porId = new Map(data.map((p) => [p.id, p]));
  const porCodigo = new Map(data.map((p) => [normal(p.codigo), p]));
  const porNombre = new Map(data.map((p) => [normal(p.nombre), p]));
  const indice = indexar(data.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: null, detalle: p.codigo })));
  const opcion = (id: string) => {
    const p = porId.get(id)!;
    return { id: p.id, codigo: p.codigo, nombre: p.nombre };
  };
  // Si lo encontrado es una variante, se elige la que dice la línea y se ofrecen todas sus hermanas (el parecido del nombre no distingue una talla de otra).
  const hermanasDe = new Map<string, typeof data>();
  for (const p of data) if (p.padre_id) hermanasDe.set(p.padre_id, [...(hermanasDe.get(p.padre_id) ?? []), p]);
  const conVariante = (nombre: string, ids: string[]): SugerenciaLinea | null => {
    const padre = porId.get(ids[0])?.padre_id;
    const hermanas = padre ? (hermanasDe.get(padre) ?? []) : [];
    if (!hermanas.length) return null;
    const id = varianteDeLinea(nombre, hermanas);
    return { skuId: id ?? hermanas[0].id, estado: id ? "seguro" : "revisar", opciones: hermanas.map((h) => opcion(h.id)) };
  };
  const sugerencias = nombres.map((bruto): SugerenciaLinea => {
    const nombre = String(bruto ?? "").slice(0, 200);
    const exacto = porCodigo.get(normal(nombre)) ?? porNombre.get(normal(nombre));
    if (exacto) return { skuId: exacto.id, estado: "seguro", opciones: [opcion(exacto.id)] };
    const iguales = todasLasCoincidencias(nombre, null, indice);
    if (iguales.length > 0) {
      const ids = [...new Set(iguales.map((c) => c.id))].slice(0, 5);
      const variante = conVariante(nombre, ids);
      if (variante) return variante;
      return { skuId: ids[0], estado: ids.length === 1 ? "seguro" : "revisar", opciones: ids.map(opcion) };
    }
    const cerca = [...new Set(parecidos(nombre, null, indice, 4).map((c) => c.id))];
    if (cerca.length > 0) return conVariante(nombre, cerca) ?? { skuId: cerca[0], estado: "revisar", opciones: cerca.map(opcion) };
    return { skuId: null, estado: "sin", opciones: [] };
  });
  return { sugerencias };
}

"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { indexar, parecidos, todasLasCoincidencias } from "@/lib/scraping/cruces";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { MAX_LINEAS_IMPORTADAS, revisarConteo } from "@/lib/wms/levantamiento";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/**
 * Guarda un levantamiento (conteo físico) de una bodega propia: cada producto contado queda en lo contado y la diferencia
 * se anota como ajuste (`wms_registrar_conteo`, migración 0214). Devuelve el error como valor.
 */
export async function guardarLevantamiento(
  bodegaId: string,
  referencia: string,
  items: unknown,
): Promise<{ error?: string; productos?: number; ajustes?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisado = revisarConteo(items);
  if ("error" in revisado) return { error: revisado.error };
  const ref = referencia.replace(/\s+/g, " ").trim().slice(0, 120);

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  const { data, error } = await supabase.rpc("wms_registrar_conteo", {
    p_bodega: bodegaId,
    p_items: revisado.items,
    p_referencia: ref || null,
    p_usuario: usuario.id,
  });
  if (error) {
    if (/wms_registrar_conteo/.test(error.message)) return { error: "Falta correr la migración 0214 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo guardar el levantamiento." };
  }
  const r = (data ?? {}) as { productos?: number; ajustes?: number };
  await registrarAuditoria({
    accion: "levantamiento_inventario",
    entidad: "wms_bodegas",
    entidadId: bodegaId,
    detalle: `Levantamiento${ref ? ` «${ref}»` : ""}: ${r.productos ?? 0} productos contados, ${r.ajustes ?? 0} con diferencia`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/levantamiento");
  return { productos: r.productos ?? 0, ajustes: r.ajustes ?? 0 };
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
 * el mismo cruce de Testing Lab) entre los productos simples que no están en Test. No guarda nada.
 */
export async function sugerirProductosParaLista(nombres: string[]): Promise<{ sugerencias: SugerenciaLinea[] } | { error: string }> {
  await requireModulo("inventario");
  if (!Array.isArray(nombres) || nombres.length === 0) return { error: "La lista está vacía." };
  if (nombres.length > MAX_LINEAS_IMPORTADAS) return { error: `Son demasiadas líneas (máximo ${MAX_LINEAS_IMPORTADAS}).` };
  const supabase = createServiceClient();
  const { data, error } = await traerTodasConError<{ id: string; codigo: string; nombre: string }>((d, h) =>
    supabase.from("skus_maestros").select("id, codigo, nombre").neq("tipo", "combo").neq("clase", "test").order("codigo").range(d, h),
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
  const sugerencias = nombres.map((bruto): SugerenciaLinea => {
    const nombre = String(bruto ?? "").slice(0, 200);
    const exacto = porCodigo.get(normal(nombre)) ?? porNombre.get(normal(nombre));
    if (exacto) return { skuId: exacto.id, estado: "seguro", opciones: [opcion(exacto.id)] };
    const iguales = todasLasCoincidencias(nombre, null, indice);
    if (iguales.length > 0) {
      const ids = [...new Set(iguales.map((c) => c.id))].slice(0, 5);
      return { skuId: ids[0], estado: ids.length === 1 ? "seguro" : "revisar", opciones: ids.map(opcion) };
    }
    const cerca = [...new Set(parecidos(nombre, null, indice, 4).map((c) => c.id))];
    if (cerca.length > 0) return { skuId: cerca[0], estado: "revisar", opciones: cerca.map(opcion) };
    return { skuId: null, estado: "sin", opciones: [] };
  });
  return { sugerencias };
}

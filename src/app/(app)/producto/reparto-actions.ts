"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { mensajeErrorReparto, revisarReparto, type LineaReparto, type StockGeneral } from "@/lib/wms/reparto-variantes";

// Repartir el stock general de un producto entre sus variantes (11 nov 2026, pedido de Jhokser; migración 0273). Mueven inventario, así que piden poder modificar Inventario.

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
const FALTA_MIGRACION = "Falta correr la migración 0273 (reparto del stock entre variantes) en la base.";

export interface DatosReparto {
  codigo: string;
  /** Su stock general está pendiente de repartir. */
  pendiente: boolean;
  /** Lo que el principal tiene como stock general en cada bodega propia. */
  general: StockGeneral[];
  variantes: { id: string; codigo: string; nombre: string; opciones: string }[];
}

/** Lo que hace falta para repartir el stock general de un producto: sus bodegas con stock y sus variantes. Basta poder abrir Producto. */
export async function obtenerRepartoVariantes(padreId: string): Promise<DatosReparto | { error: string }> {
  const usuario = await requireModulo("producto");
  if (!ES_ID(padreId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: padre, error } = await supabase.from("skus_maestros").select("id, codigo, reparto_pendiente").eq("id", padreId).maybeSingle();
  if (error) return { error: FALTA_MIGRACION };
  if (!padre) return { error: "El producto ya no existe." };
  const [{ data: stock }, { data: hijas }] = await Promise.all([
    supabase.from("wms_stock").select("bodega_id, fisico").eq("sku_maestro_id", padreId).neq("fisico", 0),
    supabase.from("skus_maestros").select("id, codigo, nombre, opciones").eq("padre_id", padreId).order("codigo"),
  ]);
  const ids = (stock ?? []).map((s) => s.bodega_id as string);
  const { data: bodegas } = ids.length ? await supabase.from("wms_bodegas").select("id, nombre, tipo").in("id", ids) : { data: [] as { id: string; nombre: string; tipo: string }[] };
  const nombre = new Map((bodegas ?? []).filter((b) => b.tipo === "propia").map((b) => [b.id as string, b.nombre as string]));
  const general: StockGeneral[] = [];
  for (const s of stock ?? []) {
    const id = s.bodega_id as string;
    if (!nombre.has(id) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, id))) continue;
    general.push({ bodegaId: id, nombre: nombre.get(id)!, fisico: Number(s.fisico) });
  }
  return {
    codigo: padre.codigo as string,
    pendiente: padre.reparto_pendiente === true,
    general: general.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    variantes: (hijas ?? []).map((h) => ({ id: h.id as string, codigo: h.codigo as string, nombre: h.nombre as string, opciones: Object.values((h.opciones ?? {}) as Record<string, string>).join(" / ") })),
  };
}

/**
 * Reparte el stock general entre las variantes. Se puede repartir solo algunas bodegas, o solo una parte de una bodega (14 nov 2026, migración 0296): en cada bodega no se
 * puede repartir más de lo que hay (la base lo vuelve a comprobar) y lo que no se reparte sigue como stock general. El producto deja de estar pendiente cuando ya no le queda
 * stock general en ninguna bodega. Devuelve el error como valor.
 */
export async function repartirStockVariantes(padreId: string, lineas: LineaReparto[]): Promise<{ error?: string; repartidas?: number; queda?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(padreId) || !Array.isArray(lineas) || lineas.length > 2000 || lineas.some((l) => !ES_ID(l?.varianteId) || !ES_ID(l?.bodegaId))) return { error: "El reparto no es válido." };
  const datos = await obtenerRepartoVariantes(padreId);
  if ("error" in datos) return datos;
  if (!datos.pendiente) return { error: "Este producto no tiene stock pendiente de repartir." };
  const revision = revisarReparto(datos.general, lineas);
  if (!revision.valido) return { error: revision.error ?? "El reparto no es válido." };
  // Con stock general por repartir, un reparto sin ninguna unidad no hace nada: se pide escribir alguna (sin stock general, el reparto vacío solo quita la marca de pendiente).
  if (revision.total === 0 && datos.general.length > 0) return { error: "Escribe cuántas unidades van a cada variante." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("wms_repartir_stock_variantes", {
    p_padre: padreId,
    p_reparto: lineas.filter((l) => l.cantidad > 0).map((l) => ({ variante: l.varianteId, bodega: l.bodegaId, cantidad: l.cantidad })),
    p_usuario: usuario.id,
  });
  if (error) return { error: mensajeErrorReparto(error.message) };
  const repartidas = Number((data as { repartidas?: number } | null)?.repartidas ?? 0);
  // Sin la migración 0296 la base no devuelve `queda`: reparte todo o nada, así que no queda nada.
  const queda = Number((data as { queda?: number } | null)?.queda ?? 0);
  await registrarAuditoria({
    accion: "repartir_stock_variantes",
    entidad: "skus_maestros",
    entidadId: padreId,
    detalle: `${repartidas} unidades de ${datos.codigo} repartidas entre sus variantes${queda > 0 ? ` (siguen ${queda} como stock general)` : ""}`,
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return { repartidas, queda };
}

/**
 * Pasa al producto principal lo que hoy tienen sus variantes y lo deja pendiente de repartir: para un producto cuyo reparto fue provisional (se dividió solo para poder crear las
 * variantes). Mientras tanto, lo que sale de una variante se descuenta del stock general. Devuelve el error como valor.
 */
export async function dejarRepartoPendiente(padreId: string): Promise<{ error?: string; unidades?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(padreId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: padre } = await supabase.from("skus_maestros").select("codigo").eq("id", padreId).maybeSingle();
  if (!padre) return { error: "El producto ya no existe." };
  const { data, error } = await supabase.rpc("wms_dejar_reparto_pendiente", { p_padre: padreId, p_usuario: usuario.id });
  if (error) {
    if (/wms_dejar_reparto_pendiente|schema cache|Could not find the function/i.test(error.message)) return { error: FALTA_MIGRACION };
    return { error: mensajeErrorReparto(error.message) };
  }
  const unidades = Number((data as { unidades?: number } | null)?.unidades ?? 0);
  await registrarAuditoria({
    accion: "dejar_reparto_pendiente",
    entidad: "skus_maestros",
    entidadId: padreId,
    detalle: `${padre.codigo}: ${unidades} unidades pasadas al stock general, pendientes de repartir entre las variantes`,
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return { unidades };
}

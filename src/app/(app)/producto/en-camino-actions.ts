"use server";

import { getUsuarioActual } from "@/lib/auth";
import { enCaminoPorPais, type EnCaminoPais, type LineaEnCamino } from "@/lib/compras/en-camino";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { createServiceClient } from "@/lib/supabase/server";
import { dentroDelAlcance, restriccionesDe } from "../compras/permisos-compras";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Lo que viene en camino de un producto: las unidades de las órdenes que ya salieron y todavía no llegan, por país (la misma regla de
 * «En tránsito» de Compras). Un producto con variantes suma las de sus variantes. Solo unidades: no trae costos. Lo pueden ver quienes abren
 * Producto, Inventario, Compras o Gestión de publicaciones Dropi, y cada uno solo los países que tiene permitidos y las compras que
 * su rol alcanza (Usuarios y roles › Afinar). Devuelve el error como valor.
 */
export async function obtenerEnCaminoProducto(id: string): Promise<{ enCamino: EnCaminoPais[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["producto", "inventario", "compras", "publicaciones-dropi"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: variantes } = await supabase.from("skus_maestros").select("id").eq("padre_id", id);
  const ids = [id, ...(variantes ?? []).map((v) => v.id as string)];
  const { data, error } = await supabase
    .from("wms_compra_items")
    .select("cantidad_pedida, wms_compras(etapa, fecha_envio, fecha_llegada, anulada_en, asignado_a, creado_por, responsable_nombre, creador_nombre, paises(codigo, nombre))")
    .in("sku_maestro_id", ids);
  if (error) return { error: "No se pudo cargar lo que viene en camino." };
  const limites = restriccionesDe(usuario.afinado.compras);
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  type Compra = { etapa: string; fecha_envio: string | null; fecha_llegada: string | null; anulada_en: string | null; asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null; paises: { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null };
  const lineas: LineaEnCamino[] = [];
  for (const l of data ?? []) {
    const c = uno(l.wms_compras as unknown as Compra | null);
    if (!c) continue;
    const pais = uno(c.paises);
    if (!puedeVerPais(usuario.paisesPermitidos, pais?.codigo ?? null)) continue;
    if (!dentroDelAlcance(limites.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario)) continue;
    lineas.push({ pais: pais?.nombre ?? null, unidades: Number(l.cantidad_pedida), etapa: c.etapa, fechaEnvio: c.fecha_envio, fechaLlegada: c.fecha_llegada, anulada: !!c.anulada_en });
  }
  return { enCamino: enCaminoPorPais(lineas) };
}

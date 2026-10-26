"use server";

import { getUsuarioActual } from "@/lib/auth";
import { cargarEnCaminoDatos, type OrdenEnCaminoDatos } from "@/lib/compras/en-camino-datos";
import { enCaminoPorPais, faltaParaLlegada, lineaEnCamino, llegadaDeCompra, type EnCaminoPais, type LineaEnCamino } from "@/lib/compras/en-camino";
import { cargarTiempos, claveTransito } from "@/lib/compras/tiempos-datos";
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Lo que viene en camino de un producto: las unidades de las órdenes ya pedidas que todavía no llegan (ya salieron o están en producción, tracking o arribo), por país; con `codigoPais`, solo el de ese país (el que está marcado en Compras). Un producto con variantes suma las de sus variantes. Solo unidades: no trae costos. Lo pueden ver quienes abren
 * Producto, Inventario, Compras o Gestión de publicaciones Dropi, y cada uno solo los países que tiene permitidos y las compras que
 * su rol alcanza (Usuarios y roles › Afinar). Devuelve el error como valor.
 */
/** Una orden en camino de un producto: cuántas unidades trae y cuándo llega (null si todavía no tiene fecha de llegada). */
export interface OrdenEnCamino {
  numero: number;
  unidades: number;
  llegada: string | null;
  origen: "limite" | "estimada" | null;
  /** La etapa de la orden en Compras («produccion», «tracking»…). */
  etapa: string;
  /** Si no tiene llegada, qué falta: su fecha de envío (aún no se envía) o su vía de envío / fecha límite (ya se envió). */
  falta: "envio" | "via" | null;
}

export async function obtenerEnCaminoProducto(id: string, codigoPais?: string | null): Promise<{ enCamino: EnCaminoPais[]; ordenes: OrdenEnCamino[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["producto", "inventario", "compras", "publicaciones-dropi"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const filtro = codigoPais ? String(codigoPais).trim().toUpperCase() : null;
  if (filtro && !/^[A-Z]{2,12}$/.test(filtro)) return { error: "País no válido." };
  // Las mismas cuentas que Gestión de IDs Dropi (`cargarEnCaminoDatos`): variantes, combos y órdenes sin productos vinculados incluidos.
  const { porProducto, ordenes: abiertas } = await cargarEnCaminoDatos(createServiceClient(), usuario, null).catch(() => ({ porProducto: new Map<string, { compraId: string; unidades: number }[]>(), ordenes: new Map<string, OrdenEnCaminoDatos>() }));
  const tiempos = await cargarTiempos();
  const lineas: LineaEnCamino[] = [];
  const ordenes: OrdenEnCamino[] = [];
  for (const a of porProducto.get(id) ?? []) {
    const c = abiertas.get(a.compraId);
    if (!c) continue;
    const linea: LineaEnCamino = { pais: c.paisNombre, codigoPais: c.paisCodigo, unidades: a.unidades, etapa: c.etapa, fechaEnvio: c.fechaEnvio, fechaLlegada: c.fechaLlegada, anulada: c.anulada };
    lineas.push(linea);
    // El detalle por orden, solo de las que cuentan (las del país marcado, si se pidió uno).
    if (!lineaEnCamino(linea) || !(linea.unidades > 0) || (filtro && (c.paisCodigo ?? "").toUpperCase() !== filtro)) continue;
    const llegada = llegadaDeCompra(tiempos, { fechaLimite: c.fechaLimite, fechaEnvio: c.fechaEnvio, vias: c.viaEnvio, clave: claveTransito(c.tipo, c.paisId) });
    ordenes.push({ numero: c.numero, unidades: linea.unidades, llegada: llegada?.fecha ?? null, origen: llegada?.origen ?? null, etapa: c.etapa, falta: llegada ? null : faltaParaLlegada({ fechaEnvio: c.fechaEnvio }) });
  }
  ordenes.sort((x, y) => (x.llegada ?? "9999").localeCompare(y.llegada ?? "9999") || x.numero - y.numero);
  return { enCamino: enCaminoPorPais(lineas, filtro), ordenes };
}

// Gestión de tienda › Logística (12 nov 2026, como la pantalla de Mi Reto Digital, con lo que hay). Solo lectura. De Shopify llega si el pedido se
// despachó («fulfilled»), la zona por la etiqueta (CIUDAD, INTERIOR/SERVIENTREGA) y la nota con la fecha que pidió el cliente; **no** llegan la guía,
// la fecha de envío ni si se entregó o se devolvió (Kenku no los carga en Shopify). Por eso «en ruta» cuenta los días desde el pedido y un pedido
// despachado queda en ruta hasta que se sepa más. Sin base: con prueba.

import type { EstadoPedido } from "./resumen";
import { etiquetasDe } from "./ordenes-finanzas";
import { diasHasta, type Programado } from "./programado";

/** En qué punto de la logística va un pedido (los cancelados y sin confirmar no son de logística). */
export type EtapaLogistica = "por_preparar" | "en_ruta" | "entregado" | "devuelto";

export function etapaLogistica(estado: EstadoPedido): EtapaLogistica | null {
  if (estado === "confirmado") return "por_preparar";
  if (estado === "en_camino") return "en_ruta";
  if (estado === "entregado") return "entregado";
  if (estado === "devuelto") return "devuelto";
  return null;
}

/**
 * La etapa con lo que dice Monday (las entregas de ciudad): un pedido despachado que Monday marca entregado está entregado; rechazado o
 * cancelado, devuelto. Sin Monday, lo de Shopify.
 */
export function etapaConEntrega(estado: EstadoPedido, entrega: { grupo: string } | null | undefined): EtapaLogistica | null {
  const e = etapaLogistica(estado);
  if (e !== "en_ruta" || !entrega) return e;
  if (entrega.grupo === "entregado") return "entregado";
  if (entrega.grupo === "rechazado" || entrega.grupo === "cancelado") return "devuelto";
  return "en_ruta";
}

/** Desde cuántos días en ruta (contados desde el pedido) se marca como demorado. */
export const DIAS_DEMORA = 5;

/**
 * La transportista: la guardada en el pedido o la de la etiqueta de zona («INTERIOR/SERVIENTREGA» → Servientrega). Null si la etiqueta solo dice
 * la zona («CIUDAD»).
 */
export function transportistaDe(guardada: string | null | undefined, etiquetas: string[] | string | null | undefined): string | null {
  if (guardada?.trim()) return guardada.trim();
  const lista = Array.isArray(etiquetas) ? etiquetas : etiquetasDe(etiquetas ?? null);
  for (const e of lista) {
    const m = /^(?:ciudad|interior)\s*\/\s*(.+)$/i.exec(e.trim());
    if (m) return m[1].trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
  }
  return null;
}

/**
 * Si un pedido por preparar ya se puede preparar: sin fecha en la nota, o la fecha que pidió el cliente llega pronto (el interior tarda más: se
 * prepara con 2 días de anticipación; la ciudad, con 1).
 */
export function listoParaPreparar(programado: Programado | null | undefined, zona: string | null, hoy: string): boolean {
  if (!programado) return true;
  const margen = zona === "Interior" ? 2 : 1;
  return diasHasta(programado.fecha, hoy) <= margen;
}

/** Los días desde el pedido (AAAA-MM-DD de su día en Panamá) hasta hoy. */
export function diasDesde(dia: string, hoy: string): number {
  return Math.max(0, -diasHasta(dia, hoy));
}

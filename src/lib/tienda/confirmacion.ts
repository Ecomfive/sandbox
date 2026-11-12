// Gestión de tienda › Confirmación (12 nov 2026, como la pantalla de Mi Reto Digital). Solo lectura: el sistema no confirma ni cancela en Shopify;
// muestra cómo va la confirmación con lo que el equipo de la tienda marca allá con etiquetas («Confirmada», «Cancelado», «Pendiente»,
// «Modificar Dirección»…). Sin base: con prueba.

import type { EstadoPedido } from "./resumen";

/** En qué punto de la confirmación va un pedido. «Programado» llegará con WhatsApp (en Mi Reto Digital la fecha sale de la conversación). */
export type EtapaConfirmacion = "por_confirmar" | "esperando" | "confirmado" | "cancelado";

export const ETAPAS_CONFIRMACION: { id: EtapaConfirmacion; etiqueta: string }[] = [
  { id: "por_confirmar", etiqueta: "Por confirmar" },
  { id: "esperando", etiqueta: "Esperando respuesta" },
  { id: "confirmado", etiqueta: "Confirmado" },
  { id: "cancelado", etiqueta: "Cancelado" },
];

/** La meta de confirmación (la misma de Mi Reto Digital). */
export const META_CONFIRMACION = 85;

/**
 * Las etiquetas con que el equipo deja un pedido sin confirmar «en gestión» (ya se habló con el cliente y se espera algo de él): «Pendiente»,
 * «Modificar Dirección», «Modificar Pedido», «POR CONFIRMAR DATOS», «No contesta», «Esperando…», «Llamar…».
 */
const EN_GESTION = /^(pendiente|modificar\b.*|por confirmar datos|no contesta.*|esperando.*|llamar.*|volver a llamar.*)$/i;

export function enGestion(etiquetas: string[] | undefined): boolean {
  return (etiquetas ?? []).some((e) => EN_GESTION.test(e.trim()));
}

/** La etapa de confirmación de un pedido, por su estado y sus etiquetas. */
export function etapaConfirmacion(p: { estado: EstadoPedido; etiquetas?: string[] }): EtapaConfirmacion {
  if (p.estado === "cancelado") return "cancelado";
  if (p.estado === "nuevo") return enGestion(p.etiquetas) ? "esperando" : "por_confirmar";
  return "confirmado";
}

export interface ResumenConfirmacion {
  porEtapa: Record<EtapaConfirmacion, number>;
  /** Confirmados ÷ todos los pedidos (en %, con un decimal); null sin pedidos. */
  tasa: number | null;
  /** Cancelados ÷ todos (en %). */
  cancelacion: number | null;
  /** Sin confirmar todavía (por confirmar + esperando) ÷ todos (en %). */
  pendiente: number | null;
}

export function resumirConfirmacion(pedidos: { estado: EstadoPedido; etiquetas?: string[] }[]): ResumenConfirmacion {
  const porEtapa: Record<EtapaConfirmacion, number> = { por_confirmar: 0, esperando: 0, confirmado: 0, cancelado: 0 };
  for (const p of pedidos) porEtapa[etapaConfirmacion(p)]++;
  const n = pedidos.length;
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : null);
  return { porEtapa, tasa: pct(porEtapa.confirmado), cancelacion: pct(porEtapa.cancelado), pendiente: pct(porEtapa.por_confirmar + porEtapa.esperando) };
}

/** Cuánto lleva esperando un pedido: «25 min», «3 h», «2 d». */
export function tiempoEsperando(desdeIso: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(desdeIso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

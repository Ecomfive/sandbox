export type TonoEstado = "success" | "warning" | "destructive" | "neutral";

/**
 * Color semántico por estado real de pedido en Dropi (verde = entregado,
 * ámbar = en proceso, rojo = cancelado/devuelto). Cualquier estado nuevo que
 * no esté en esta lista cae en gris ("neutral") en vez de romper la página.
 */
const MAPA_ESTADOS: Record<string, TonoEstado> = {
  ENTREGADO: "success",
  "NOVEDAD SOLUCIONADA": "success",

  CANCELADO: "destructive",
  DEVOLUCION: "destructive",
  "DEVOLUCION EN BODEGA": "destructive",
  "EN PROCESO DE DEVOLUCION": "destructive",

  PENDIENTE: "warning",
  NOVEDAD: "warning",
  ASIGNADO: "warning",
  GUIA_GENERADA: "warning",
  "EN PROCESAMIENTO": "warning",
  "PREPARADO PARA TRANSPORTADORA": "warning",
  "EN REPARTO": "warning",
  "EN TRANSITO": "warning",
  "EN BODEGA ORIGEN": "warning",
  "BODEGA DESTINO": "warning",
};

export function toneEstadoPedido(estado: string): TonoEstado {
  return MAPA_ESTADOS[estado.toUpperCase().trim()] ?? "neutral";
}

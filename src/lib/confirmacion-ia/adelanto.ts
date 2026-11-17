// Confirmación con IA › pago por adelantado (17 nov 2026): las zonas de difícil acceso o fronterizas (Bocas del Toro, Puerto Armuelles…) que se pagan por adelantado. Una palabra sola o varias juntas que, si salen en la
// dirección o en la ciudad, vuelven el pedido «En espera de pago». Lógica pura, con prueba; usa las mismas reglas de comparación que las palabras de zona.

import { coincidencias, type ReglaZona } from "./zonas";

/** Las zonas de pago por adelantado que salen en la dirección o en la ciudad (completas y en ese orden). Sin zonas cargadas, ninguna: el pago por adelantado no se activa solo. */
export function zonasDeAdelanto(direccion: string | null, ciudad: string | null, zonas: ReglaZona[]): ReglaZona[] {
  if (!zonas.length) return [];
  return coincidencias(`${direccion ?? ""} ${ciudad ?? ""}`, zonas);
}

/** La frase que queda como motivo del análisis. */
export const motivoDeAdelanto = (coinc: ReglaZona[]): string => `Zona de pago por adelantado: ${[...new Set(coinc.map((z) => z.texto))].join(", ")}. No se propone etiqueta hasta que el asesor verifique el pago.`;

/** Las cifras de «En espera de pago»: los que siguen sin la etiqueta real de Shopify y los que ya la tienen (pagaron y el asesor la puso). */
export function enEspera<T extends { estado: string; etiquetaActual: string | null }>(filas: T[]): { esperando: T[]; etiquetados: T[] } {
  const todas = filas.filter((f) => f.estado === "adelantado");
  return { esperando: todas.filter((f) => !f.etiquetaActual), etiquetados: todas.filter((f) => !!f.etiquetaActual) };
}

// Confirmación con IA › pago por adelantado (17 nov 2026): las zonas de difícil acceso o fronterizas (Bocas del Toro, Puerto Armuelles…) que se pagan por adelantado. Son palabras de zona (una sola o varias juntas) con
// «Pago por adelantado» como zona: si salen en la dirección o en la ciudad, el pedido queda «En espera de pago». Lógica pura, con prueba.

import { coincidencias, type ReglaZona } from "./zonas";

/** Las palabras de pago por adelantado (de todas las palabras de zona del país) que salen en la dirección o en la ciudad, completas y en ese orden. Sin ninguna cargada, ninguna: el pago por adelantado no se activa solo. */
export function zonasDeAdelanto(direccion: string | null, ciudad: string | null, reglas: ReglaZona[]): ReglaZona[] {
  const zonas = reglas.filter((r) => r.resultado === "adelantado");
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

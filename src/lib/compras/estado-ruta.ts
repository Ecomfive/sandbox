// Compras › Envíos: en qué estado está una ruta contra lo que promete su agente, y cómo se dibuja su barra «uso del plazo».
// Lógica pura (con su prueba): la usan la lista de rutas, los indicadores y el panel de prioridades.

import type { ResumenesReales } from "./rutas-envio";

/**
 * - `tarde`: lo real (12 meses) pasa del plazo máximo prometido.
 * - `ok`: lo real está dentro del plazo.
 * - `sin_medir`: promete un plazo pero aún no hay envíos para medirlo.
 * - `sin_plazo`: no se definió qué promete el agente (aunque haya envíos).
 */
export type EstadoRuta = "tarde" | "ok" | "sin_medir" | "sin_plazo";

/** Los días reales que mandan en una ruta: el promedio de los últimos 12 meses o, si no hay, el histórico. */
export function realQueManda(r: ResumenesReales) {
  return r.ultimos12.promedio !== null ? r.ultimos12 : r.historico;
}

/** El estado de una ruta y, cuando se puede medir, los días de diferencia contra el plazo máximo (positivo = se pasó). */
export function estadoRuta(diasMax: number | null, real: number | null): { estado: EstadoRuta; delta: number | null } {
  if (diasMax === null) return { estado: "sin_plazo", delta: null };
  if (real === null) return { estado: "sin_medir", delta: null };
  return { estado: real > diasMax ? "tarde" : "ok", delta: real - diasMax };
}

/** La frase corta que acompaña al estado: «+7 d sobre el plazo», «3 d de margen», «Aún sin envíos»… */
export function detalleEstado(estado: EstadoRuta, delta: number | null): string {
  switch (estado) {
    case "tarde":
      return `+${delta} d sobre el plazo`;
    case "ok":
      return delta === 0 ? "En el límite del plazo" : `${-(delta ?? 0)} d de margen`;
    case "sin_medir":
      return "Aún sin envíos";
    case "sin_plazo":
      return "Definir el plazo";
  }
}

/** La barra va de 0 a 2,2 veces el plazo máximo: todas las rutas se comparan en la misma escala y la línea del máximo queda siempre en el mismo sitio. */
export const ESCALA_BARRA = 2.2;

export interface GeometriaBarra {
  /** Dónde empieza y cuánto ocupa la franja del plazo prometido (% del ancho). */
  zonaIzq: number;
  zonaAncho: number;
  /** Lo que tardó dentro del plazo, desde el inicio (% del ancho). */
  dentro: number;
  /** Lo que se pasó del plazo: dónde empieza (el máximo) y cuánto ocupa (% del ancho). */
  excesoIzq: number;
  excesoAncho: number;
  /** Dónde cae la línea del plazo máximo (% del ancho). */
  limite: number;
}

/** Las medidas de la barra en porcentaje del ancho; `real` null deja solo la franja del plazo. */
export function geometriaBarra(min: number, max: number, real: number | null): GeometriaBarra {
  const total = Math.max(max, 1) * ESCALA_BARRA;
  const pos = (d: number) => Math.min(100, Math.max(0, (d / total) * 100));
  const tarde = real !== null && real > max;
  return {
    zonaIzq: pos(min),
    zonaAncho: Math.max(0, pos(max) - pos(min)),
    dentro: real === null ? 0 : pos(Math.min(real, max)),
    excesoIzq: pos(max),
    excesoAncho: tarde ? pos(real) - pos(max) : 0,
    limite: pos(max),
  };
}

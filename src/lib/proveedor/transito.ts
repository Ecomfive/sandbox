// Portal del proveedor: cuánto lleva en camino un pedido contra el plazo prometido de su país y vía (Compras › Envíos,
// `wms_rutas_envio`). Lógica pura.

import { diasEntre } from "./fechas";
import type { TonoCuota } from "./cuotas";

export interface Plazo {
  min: number | null;
  max: number | null;
}

/** Qué dice el estado, para escribirlo en el idioma de quien lo ve (`textos.ts`); `n` son los días de la frase. */
export type ClaveEstadoTransito = "llego" | "llego_tarde" | "llego_antes" | "llego_a_tiempo" | "sin_plazo" | "atrasado" | "por_llegar" | "en_plazo";

export interface EstadoTransito {
  tono: TonoCuota;
  texto: string;
  clave: ClaveEstadoTransito;
  n: number;
  dias: number;
}

/** A cuántos días del plazo se avisa que ya está por llegar. */
export const DIAS_POR_LLEGAR = 7;

export function estadoTransito(fechaEnvio: string, fechaLlegada: string | null, plazo: Plazo | null, hoy: string): EstadoTransito {
  const dias = diasEntre(fechaEnvio, fechaLlegada ?? hoy);
  const max = plazo?.max ?? plazo?.min ?? null;
  const min = plazo?.min ?? max;
  if (fechaLlegada) {
    if (max == null || min == null) return { tono: "neutro", texto: `Llegó en ${dias} d`, dias, clave: "llego", n: dias };
    if (dias > max) return { tono: "peligro", texto: `Llegó ${dias - max} d tarde`, dias, clave: "llego_tarde", n: dias - max };
    if (dias < min) return { tono: "exito", texto: `Llegó ${min - dias} d antes`, dias, clave: "llego_antes", n: min - dias };
    return { tono: "exito", texto: `Llegó a tiempo (${dias} d)`, dias, clave: "llego_a_tiempo", n: dias };
  }
  if (max == null) return { tono: "neutro", texto: "Sin plazo acordado", dias, clave: "sin_plazo", n: 0 };
  if (dias > max) return { tono: "peligro", texto: `Atrasado ${dias - max} d`, dias, clave: "atrasado", n: dias - max };
  if (max - dias <= DIAS_POR_LLEGAR) return { tono: "aviso", texto: `Llega en ≤ ${max - dias} d`, dias, clave: "por_llegar", n: max - dias };
  return { tono: "exito", texto: "En plazo", dias, clave: "en_plazo", n: max - dias };
}

/** El plazo como texto: «45–55 d», «80 d» o «—». */
export function textoPlazo(plazo: Plazo | null): string {
  const max = plazo?.max ?? plazo?.min ?? null;
  const min = plazo?.min ?? max;
  if (max == null || min == null) return "—";
  return min === max ? `${max} d` : `${min}–${max} d`;
}

/** Mediana y rango de los días de tránsito de pedidos que ya llegaron. */
export function resumenTransito(dias: number[]) {
  if (!dias.length) return null;
  const o = [...dias].sort((a, b) => a - b);
  return { envios: o.length, mediana: o[Math.floor(o.length / 2)], min: o[0], max: o[o.length - 1] };
}

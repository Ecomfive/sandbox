// Anuncios Meta: las cuentas del equipo. Resultados de un grupo de anuncios (suma de días) y lo que se calcula de ellos. Todo en dólares, como los reporta Meta. Lógica pura, con prueba.

import { nivelCtr, nivelHookRate, type NivelMetrica } from "@/lib/metricas-meta-ads";

export interface Resultados {
  gasto: number;
  impresiones: number;
  clics: number;
  /** Reproducciones de 3 segundos (el «hook»). */
  video3s: number;
  /** ThruPlay: llegaron a 15 s o al final. */
  video15s: number;
  vioLanding: number;
  carrito: number;
  pago: number;
  compras: number;
  valor: number;
}

export const sinResultados = (): Resultados => ({ gasto: 0, impresiones: 0, clics: 0, video3s: 0, video15s: 0, vioLanding: 0, carrito: 0, pago: 0, compras: 0, valor: 0 });

export function sumar(a: Resultados, b: Partial<Resultados>): Resultados {
  return {
    gasto: a.gasto + (b.gasto ?? 0),
    impresiones: a.impresiones + (b.impresiones ?? 0),
    clics: a.clics + (b.clics ?? 0),
    video3s: a.video3s + (b.video3s ?? 0),
    video15s: a.video15s + (b.video15s ?? 0),
    vioLanding: a.vioLanding + (b.vioLanding ?? 0),
    carrito: a.carrito + (b.carrito ?? 0),
    pago: a.pago + (b.pago ?? 0),
    compras: a.compras + (b.compras ?? 0),
    valor: a.valor + (b.valor ?? 0),
  };
}

/** Con menos gasto que esto, un número no alcanza para comparar (una campaña con $20 y 2 compras no «gana» a una con $600). */
export const GASTO_MINIMO_CONFIABLE = 100;
/** El CPA tope mientras nadie lo defina para el producto (el equipo lo cambia en «Cuentas»; los umbrales de Productos Test ya consideran malo todo lo que pasa de $4). */
export const CPA_TOPE_PREDETERMINADO = 3;

export const cpa = (r: Resultados): number | null => (r.compras > 0 ? r.gasto / r.compras : null);
export const ctr = (r: Resultados): number | null => (r.impresiones > 0 ? (r.clics / r.impresiones) * 100 : null);
export const hookRate = (r: Resultados): number | null => (r.impresiones > 0 && r.video3s > 0 ? (r.video3s / r.impresiones) * 100 : null);
export const holdRate = (r: Resultados): number | null => (r.video3s > 0 ? (r.video15s / r.video3s) * 100 : null);
/** Compras ÷ visitas a la landing: lo que convierte la página. */
export const conversion = (r: Resultados): number | null => (r.vioLanding > 0 ? (r.compras / r.vioLanding) * 100 : null);
/** Lo que dejó, antes de gastos del negocio: compras × lo que se puede pagar por compra, menos lo gastado. Positivo = el anuncio se pagó solo. */
export const resultado = (r: Resultados, tope: number): number => r.compras * tope - r.gasto;
export const confiable = (r: Resultados): boolean => r.gasto >= GASTO_MINIMO_CONFIABLE;

export const nivelDeResultado = (v: number): NivelMetrica => (v > 15 ? "bueno" : v < -15 ? "malo" : "medio");
/** El CPA frente a su tope: dentro del tope, bien; hasta 30 % por encima, regular; más, mal. */
export const nivelDeCpa = (valor: number | null, tope: number): NivelMetrica => (valor === null ? "neutral" : valor <= tope ? "bueno" : valor > tope * 1.3 ? "malo" : "medio");
export const nivelDeCtr = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelCtr(v));
export const nivelDeHook = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelHookRate(v));

export const dolares = (n: number): string => `$${n.toFixed(2)}`;
export const dolaresEnteros = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(0)}`;
export const conSigno = (n: number): string => `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(0)}`;

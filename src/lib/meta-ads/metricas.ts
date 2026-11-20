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
  /** Reproducciones que llegaron al 25, 50, 75 y 95 % del video (la retención que da Meta; 0 = sin dato). */
  video25: number;
  video50: number;
  video75: number;
  video95: number;
  vioLanding: number;
  carrito: number;
  pago: number;
  compras: number;
  valor: number;
}

export const sinResultados = (): Resultados => ({ gasto: 0, impresiones: 0, clics: 0, video3s: 0, video15s: 0, video25: 0, video50: 0, video75: 0, video95: 0, vioLanding: 0, carrito: 0, pago: 0, compras: 0, valor: 0 });

export function sumar(a: Resultados, b: Partial<Resultados>): Resultados {
  return {
    gasto: a.gasto + (b.gasto ?? 0),
    impresiones: a.impresiones + (b.impresiones ?? 0),
    clics: a.clics + (b.clics ?? 0),
    video3s: a.video3s + (b.video3s ?? 0),
    video15s: a.video15s + (b.video15s ?? 0),
    video25: a.video25 + (b.video25 ?? 0),
    video50: a.video50 + (b.video50 ?? 0),
    video75: a.video75 + (b.video75 ?? 0),
    video95: a.video95 + (b.video95 ?? 0),
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
/** De cada 100 que vieron 3 s, cuántos llegaron al 25, 50, 75 y 95 % del video (null si Meta no dio esa retención todavía). */
export function retencion(r: Resultados): { p25: number; p50: number; p75: number; p95: number } | null {
  if (r.video3s <= 0 || r.video25 + r.video50 + r.video75 + r.video95 <= 0) return null;
  const f = (n: number) => Math.min(100, (n / r.video3s) * 100);
  return { p25: f(r.video25), p50: f(r.video50), p75: f(r.video75), p95: f(r.video95) };
}
/**
 * De cada 100 que vieron 3 s, cuántos siguen viendo cuando aparece el llamado a la acción: se calcula sobre la retención por cuartiles, en línea recta entre un punto y el siguiente.
 * Es una estimación (Meta no da la retención segundo a segundo). Null sin retención, sin el segundo del llamado o sin la duración.
 */
export function llegaAlLlamado(r: Resultados, ctaSegundo: number | null, duracionS: number | null): number | null {
  const q = retencion(r);
  if (!q || ctaSegundo === null || !duracionS || duracionS <= 0) return null;
  const x = Math.min(1, Math.max(0, ctaSegundo / duracionS));
  const puntos: [number, number][] = [[0, 100], [0.25, q.p25], [0.5, q.p50], [0.75, q.p75], [0.95, q.p95]];
  if (x >= 0.95) return q.p95;
  for (let i = 1; i < puntos.length; i++) {
    const [x1, y1] = puntos[i - 1];
    const [x2, y2] = puntos[i];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return q.p95;
}
/** Visitas a la landing ÷ clics del enlace: cuántos de los que hicieron clic llegaron a ver la página (si es bajo, el clic se pierde por el camino o por la velocidad). */
export const clicAVisita = (r: Resultados): number | null => (r.clics > 0 && r.vioLanding > 0 ? Math.min(100, (r.vioLanding / r.clics) * 100) : null);
/** Compras ÷ visitas a la landing: lo que convierte la página. */
export const conversion = (r: Resultados): number | null => (r.vioLanding > 0 ? (r.compras / r.vioLanding) * 100 : null);
/** Lo que dejó, antes de gastos del negocio: compras × lo que se puede pagar por compra, menos lo gastado. Positivo = el anuncio se pagó solo. */
export const resultado = (r: Resultados, tope: number): number => r.compras * tope - r.gasto;
export const confiable = (r: Resultados): boolean => r.gasto >= GASTO_MINIMO_CONFIABLE;

/** Qué tan firme es lo que dice un grupo de campañas o videos. */
export type Certeza = "firme" | "probable" | "poca";
export const GASTO_FIRME = 300;
export const COMPRAS_FIRME = 10;
export const UNIDADES_FIRME = 3;
/**
 * Poca data: menos de $100 gastados. Firme: al menos $300, de 3 campañas o videos distintos, y o bien 10 compras o más (funciona de verdad) o ninguna (no funciona de verdad). Probable: lo demás.
 * Una sola campaña o un solo video con muchas compras todavía no es «firme»: puede ser suerte de ese anuncio y no del ángulo.
 */
export function certezaDe(r: Resultados, unidades: number): Certeza {
  if (!confiable(r)) return "poca";
  if (r.gasto >= GASTO_FIRME && unidades >= UNIDADES_FIRME && (r.compras >= COMPRAS_FIRME || r.compras === 0)) return "firme";
  return "probable";
}
export const NOMBRE_CERTEZA: Record<Certeza, string> = { firme: "Firme", probable: "Probable", poca: "Poca data" };

export const nivelDeResultado = (v: number): NivelMetrica => (v > 15 ? "bueno" : v < -15 ? "malo" : "medio");
/** El CPA frente a su tope: dentro del tope, bien; hasta 30 % por encima, regular; más, mal. */
export const nivelDeCpa = (valor: number | null, tope: number): NivelMetrica => (valor === null ? "neutral" : valor <= tope ? "bueno" : valor > tope * 1.3 ? "malo" : "medio");
export const nivelDeCtr = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelCtr(v));
export const nivelDeHook = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelHookRate(v));

export const dolares = (n: number): string => `$${n.toFixed(2)}`;
export const dolaresEnteros = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(0)}`;
export const conSigno = (n: number): string => `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(0)}`;

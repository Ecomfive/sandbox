// Anuncios Meta: las cuentas del equipo. Resultados de un grupo de anuncios (suma de días) y lo que se calcula de ellos. Todo en dólares, como los reporta Meta. Lógica pura, con prueba.

import { nivelCpa, nivelCpm, nivelCtr, nivelCvr, nivelEfectividad, nivelGasto, nivelHookRate, type NivelMetrica } from "@/lib/metricas-meta-ads";

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
  /** Reproducciones del video y tiempo total visto en segundos (promedio de Meta × reproducciones): sumables; el promedio es `tiempoPromedio`. 0 = sin dato. */
  reproducciones: number;
  segundosVistos: number;
  vioLanding: number;
  carrito: number;
  pago: number;
  compras: number;
  valor: number;
}

export const sinResultados = (): Resultados => ({ gasto: 0, impresiones: 0, clics: 0, video3s: 0, video15s: 0, video25: 0, video50: 0, video75: 0, video95: 0, reproducciones: 0, segundosVistos: 0, vioLanding: 0, carrito: 0, pago: 0, compras: 0, valor: 0 });

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
    reproducciones: a.reproducciones + (b.reproducciones ?? 0),
    segundosVistos: a.segundosVistos + (b.segundosVistos ?? 0),
    vioLanding: a.vioLanding + (b.vioLanding ?? 0),
    carrito: a.carrito + (b.carrito ?? 0),
    pago: a.pago + (b.pago ?? 0),
    compras: a.compras + (b.compras ?? 0),
    valor: a.valor + (b.valor ?? 0),
  };
}

/** Con menos gasto que esto, un número no alcanza para comparar (una campaña con $20 y 2 compras no «gana» a una con $600). */
export const GASTO_MINIMO_CONFIABLE = 100;
/** El CPA tope mientras nadie lo defina para el producto: $10 (23 nov 2026, indicado por Alcides; antes $3). El equipo lo cambia por producto en «Cuentas». */
export const CPA_TOPE_PREDETERMINADO = 10;

/** Segundos que se ve en promedio cada reproducción del video (null si Meta todavía no dio el dato). */
export const tiempoPromedio = (r: Resultados): number | null => (r.reproducciones > 0 && r.segundosVistos > 0 ? r.segundosVistos / r.reproducciones : null);
/** Tiempo promedio de reproducción (documento «Métrica»): bien desde 8 s, mal hasta 5 s. */
export const nivelTiempo = (s: number | null): NivelMetrica => (s === null ? "neutral" : s >= 8 ? "bueno" : s > 5 ? "medio" : "malo");
/** Frecuencia (documento «Métrica»): bien hasta 2.20 veces, mal pasadas 2.80 (saturación). */
export const nivelFrecuencia = (f: number | null): NivelMetrica => (f === null ? "neutral" : f <= 2.2 ? "bueno" : f <= 2.8 ? "medio" : "malo");

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
/** Costo por mil impresiones. */
export const cpm = (r: Resultados): number | null => (r.impresiones > 0 ? (r.gasto / r.impresiones) * 1000 : null);
/** «% Efectividad» de la hoja de Control de Testing: las visitas a la landing que salen de los clics (visitas ÷ clics del enlace). */
export const efectividad = clicAVisita;
/** «CVR» de la hoja: compras ÷ visitas a la landing. */
export const cvr = conversion;
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

/**
 * Qué quiere decir el nivel de un grupo, en una frase y con lo que le falta: «Probable» no es un error, es que ya hay algo de data pero todavía no la suficiente para darlo por cierto.
 * `unidad` es lo que se cuenta («videos», «campañas»).
 */
export function motivoDeCerteza(r: Resultados, unidades: number, unidad: string): string {
  const nivel = certezaDe(r, unidades);
  if (nivel === "firme") return `Firme: hay datos de sobra (más de $${GASTO_FIRME} gastados, ${UNIDADES_FIRME} o más ${unidad} y ${r.compras === 0 ? "ninguna compra" : "10 compras o más"}). Se puede dar por cierto.`;
  if (nivel === "poca") return `Poca data: menos de $${GASTO_MINIMO_CONFIABLE} gastados. Todavía no se puede decir si funciona.`;
  const falta: string[] = [];
  if (r.gasto < GASTO_FIRME) falta.push(`$${Math.ceil(GASTO_FIRME - r.gasto)} más de gasto`);
  if (unidades < UNIDADES_FIRME) falta.push(`${UNIDADES_FIRME - unidades} ${UNIDADES_FIRME - unidades === 1 ? unidad.replace(/s$/, "") : unidad} más`);
  if (r.compras > 0 && r.compras < COMPRAS_FIRME) falta.push(`${COMPRAS_FIRME - r.compras} compras más`);
  return `Probable: va bien encaminado, pero todavía no es seguro. Para ser firme falta ${falta.join(", ")}.`;
}

export const nivelDeResultado = (v: number): NivelMetrica => (v > 15 ? "bueno" : v < -15 ? "malo" : "medio");
/** El CPA frente a su tope: dentro del tope, bien; hasta 30 % por encima, regular; más, mal. */
export const nivelDeCpa = (valor: number | null, tope: number): NivelMetrica => (valor === null ? "neutral" : valor <= tope ? "bueno" : valor > tope * 1.3 ? "malo" : "medio");
export const nivelDeCtr = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelCtr(v));
export const nivelDeHook = (v: number | null): NivelMetrica => (v === null ? "neutral" : nivelHookRate(v));

export const dolares = (n: number): string => `$${n.toFixed(2)}`;
export const dolaresEnteros = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(0)}`;
export const conSigno = (n: number): string => `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(0)}`;
/** Como `conSigno`, pero con miles abreviados para que quepa en un espacio chico: «−$149 mil», «+$12.5 mil»; de menos de $10 000 va entero. */
export const conSignoCompacto = (n: number): string => {
  const a = Math.abs(n);
  const signo = n < 0 ? "−" : "+";
  const sinCero = (x: number) => x.toFixed(1).replace(/[.]0$/, "");
  if (a < 10_000) return `${signo}$${a.toFixed(0)}`;
  if (a < 1_000_000) return `${signo}$${a >= 100_000 ? (a / 1000).toFixed(0) : sinCero(a / 1000)} mil`;
  return `${signo}$${sinCero(a / 1_000_000)} M`;
};

/** Las ocho cifras que se miran de una campaña, en el orden de la hoja «Control de Testing» (23 nov 2026, pedido de Jhokser). */
export type ClaveMetrica = "cpm" | "efectividad" | "hook" | "ctr" | "cpa" | "gasto" | "compras" | "cvr";
export const METRICAS_CAMPANA: { clave: ClaveMetrica; titulo: string }[] = [
  { clave: "cpm", titulo: "CPM" },
  { clave: "efectividad", titulo: "% Efectividad" },
  { clave: "hook", titulo: "Hook Rate" },
  { clave: "ctr", titulo: "CTR" },
  { clave: "cpa", titulo: "CPA" },
  { clave: "gasto", titulo: "Gasto" },
  { clave: "compras", titulo: "Compras" },
  { clave: "cvr", titulo: "CVR" },
];

/**
 * Las escalas de **ventas** (documento «Métrica» de Oferfy, 23 nov 2026): CPA bien hasta $9.50 y mal desde $11; CTR del enlace bien desde 3 % y mal bajo 2 %; CPM bien hasta $5.50 y mal desde $7.50; Hook Rate bien desde
 * 40 %, regular desde 25 % y mal bajo 25 %; efectividad de la visita a la landing bien desde 85 % y mal bajo 75 %; conversión de la landing bien desde 1.5 % y mal bajo 1 %. Gasto y compras no llevan color.
 */
const escalaVenta = {
  cpm: (v: number): NivelMetrica => (v <= 5.5 ? "bueno" : v <= 7.5 ? "medio" : "malo"),
  ctr: (v: number): NivelMetrica => (v >= 3 ? "bueno" : v >= 2 ? "medio" : "malo"),
  hook: (v: number): NivelMetrica => (v >= 40 ? "bueno" : v >= 25 ? "medio" : "malo"),
  efectividad: (v: number): NivelMetrica => (v >= 85 ? "bueno" : v >= 75 ? "medio" : "malo"),
  cvr: (v: number): NivelMetrica => (v >= 1.5 ? "bueno" : v >= 1 ? "medio" : "malo"),
  cpa: (v: number): NivelMetrica => (v <= 9.5 ? "bueno" : v <= 11 ? "medio" : "malo"),
};

/**
 * El color de cada cifra. **En ventas** valen las escalas del documento «Métrica» (`escalaVenta`). **En testing** (campañas de etapa «Test») valen las escalas de la hoja de Control de Testing —las mismas de Productos Test, `@/lib/metricas-meta-ads`—: CPM menor que 3 bien y mayor
 * que 5 mal; % Efectividad mayor que 80 bien y menor que 70 mal; Hook mayor que 40 bien y menor que 30 mal; CTR mayor que 3 bien y menor que 2 mal; CPA menor que 2 bien y mayor que 4 mal; CVR mayor que 9
 * bien y menor que 4 mal; Gasto mayor que 24 mal; lo de en medio, regular (los dos extremos incluidos). Una campaña de testing que gastó y no compró lleva el CPA en rojo si ya pasó de $4, como la hoja
 * (que pone el gasto como CPA). **Escala y retargeting** todavía no tienen sus rangos (los dará el equipo): conservan lo que había (CPA frente a su tope, CTR y Hook) y el resto sin color.
 */
export function nivelesDeMetricas(r: Resultados, etapa: string | null, tope: number): Record<ClaveMetrica, NivelMetrica> {
  const sinColor: Record<ClaveMetrica, NivelMetrica> = { cpm: "neutral", efectividad: "neutral", hook: "neutral", ctr: "neutral", cpa: "neutral", gasto: "neutral", compras: "neutral", cvr: "neutral" };
  const valor = <T extends number | null>(v: T, f: (n: number) => NivelMetrica): NivelMetrica => (v === null ? "neutral" : f(v));
  if (etapa === "venta") {
    // El CPA se pinta contra el tope del producto: con un tope ajustado de $9, los cortes del documento bajan en la misma proporción.
    const f = tope > 0 ? Math.min(1, tope / CPA_TOPE_PREDETERMINADO) : 1;
    return {
      cpm: valor(cpm(r), escalaVenta.cpm),
      efectividad: valor(efectividad(r), escalaVenta.efectividad),
      hook: valor(hookRate(r), escalaVenta.hook),
      ctr: valor(ctr(r), escalaVenta.ctr),
      // Gastó más del CPA en rojo sin comprar: malo (el documento corta el anuncio a los $12).
      cpa: r.compras === 0 && r.gasto > 0 ? (r.gasto >= 12 * f ? "malo" : "neutral") : valor(cpa(r), (v) => escalaVenta.cpa(v / f)),
      gasto: "neutral",
      compras: "neutral",
      cvr: valor(cvr(r), escalaVenta.cvr),
    };
  }
  if (etapa !== "testing") return { ...sinColor, cpa: nivelDeCpa(cpa(r), tope), ctr: nivelDeCtr(ctr(r)), hook: nivelDeHook(hookRate(r)) };
  const sinCompras = r.compras === 0 && r.gasto > 0;
  return {
    cpm: valor(cpm(r), nivelCpm),
    efectividad: valor(efectividad(r), nivelEfectividad),
    hook: valor(hookRate(r), nivelHookRate),
    ctr: valor(ctr(r), nivelCtr),
    cpa: sinCompras ? (nivelCpa(r.gasto) === "malo" ? "malo" : "neutral") : valor(cpa(r), nivelCpa),
    gasto: r.gasto > 0 ? nivelGasto(r.gasto) : "neutral",
    compras: "neutral",
    cvr: valor(cvr(r), nivelCvr),
  };
}

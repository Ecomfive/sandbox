// Formato único de los números del Portal AF4 360° (dinero, porcentajes, puntos, cantidades). Sirve en el servidor y en
// el cliente: no lee cookies ni base. Reemplaza las copias de `usd`, `dinero`, `pct`, `formatoDinero` de cada página.
//
// Reglas (iguales en todo el portal):
//  - Locale de Panamá (es-PA) para dólares y de Costa Rica (es-CR) para colones: «$1,234» y «₡1 234».
//  - Un negativo lleva el **signo menos tipográfico** (U+2212, «−$1,234»), nunca paréntesis ni el guion: se lee igual en
//    una tarjeta, una tabla, el eje de una gráfica y un lector de pantalla («menos»), y las columnas quedan alineadas.
//  - Gestión sin decimales; los montos unitarios (ticket, costo por entrega) con dos.
//  - Cero exacto (o menos de medio centavo) en una tabla se muestra como «—» con `vacioSiCero`.
//  - El color de un negativo no lo pone el formato: lo pone quien lo dibuja, con un token (`text-destructive`).

/** El signo menos tipográfico (U+2212). */
export const MENOS = "−";
/** Lo que se muestra cuando no hay dato. */
export const SIN_DATO = "—";

export type Moneda = "USD" | "CRC" | (string & {});

const LOCALE: Record<string, string> = { USD: "es-PA", CRC: "es-CR", USDT: "es-PA" };
const localeDe = (moneda: string) => LOCALE[moneda] ?? "es-PA";

// Los Intl.NumberFormat cuestan: se guardan por combinación de opciones.
const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opciones: Intl.NumberFormatOptions): Intl.NumberFormat {
  const clave = `${locale}|${JSON.stringify(opciones)}`;
  let f = cache.get(clave);
  if (!f) {
    f = new Intl.NumberFormat(locale, opciones);
    cache.set(clave, f);
  }
  return f;
}

/** Cambia el guion de un negativo por el signo menos tipográfico. */
const conMenos = (texto: string) => texto.replace(/^-/, MENOS);

/** ¿Es (casi) cero? Menos de medio centavo cuenta como cero, para no mostrar «−$0». */
export const esCero = (v: number) => Math.abs(v) < 0.005;

export interface OpcionesDinero {
  /** Decimales (0 por defecto; 2 para unitarios). */
  decimales?: number;
  /** Hasta cuántos decimales si hacen falta (costos unitarios: «$1.25», «$0.0375»). Sin él, `decimales` fijos. */
  decimalesMax?: number;
  /** «+$1,200» para una variación (el cero queda sin signo). */
  conSigno?: boolean;
  /** Cero → «—» (para celdas de tabla). */
  vacioSiCero?: boolean;
}

function monedaIntl(moneda: string): { currency: string; sufijo: string } {
  // USDT no es una moneda ISO: se escribe como dólares con su sufijo.
  return moneda === "USDT" ? { currency: "USD", sufijo: " USDT" } : { currency: moneda, sufijo: "" };
}

/** Un monto: «$1,234», «−₡3 400 000», «+$1,200» (con `conSigno`). null/undefined → «—». */
export function dinero(valor: number | null | undefined, moneda: Moneda = "USD", opciones: OpcionesDinero = {}): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  const { decimales = 0, decimalesMax, conSigno = false, vacioSiCero = false } = opciones;
  if (vacioSiCero && esCero(valor)) return SIN_DATO;
  const maximo = Math.max(decimales, decimalesMax ?? decimales);
  // Con más decimales que dos, «cero» es lo que no se ve con esos decimales (un costo de $0.004 no es cero).
  const v = maximo <= 2 && esCero(valor) ? 0 : valor;
  const { currency, sufijo } = monedaIntl(moneda);
  const texto = nf(localeDe(moneda), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimales,
    maximumFractionDigits: maximo,
    signDisplay: conSigno ? "exceptZero" : "auto",
  }).format(v);
  return conMenos(texto) + sufijo;
}

/** Un monto con centavos («$12.50»): unitarios (ticket, costo por entrega), nómina, recibos y cierres de caja. */
export function dinero2(valor: number | null | undefined, moneda: Moneda = "USD", opciones: Omit<OpcionesDinero, "decimales"> = {}): string {
  return dinero(valor, moneda, { ...opciones, decimales: 2 });
}

/** Un monto abreviado, para ejes de gráficas y cifras grandes: «$12.3 K», «−$1.2 M», «₡3,4 M». */
export function dineroCompacto(valor: number | null | undefined, moneda: Moneda = "USD", opciones: { conSigno?: boolean } = {}): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  const v = esCero(valor) ? 0 : valor;
  const { currency, sufijo } = monedaIntl(moneda);
  // Debajo de mil no se abrevia ni lleva decimales («$850», no «$850.0»).
  const abreviar = Math.abs(v) >= 1000;
  const texto = nf(localeDe(moneda), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: abreviar ? "compact" : "standard",
    maximumFractionDigits: abreviar ? 1 : 0,
    signDisplay: opciones.conSigno ? "exceptZero" : "auto",
  }).format(v);
  return conMenos(texto) + sufijo;
}

/** Monto «inteligente» para un KPI: completo hasta 10 millones, compacto encima (una tarjeta no cabe «$123,456,789»). */
export function dineroKpi(valor: number | null | undefined, moneda: Moneda = "USD"): string {
  if (valor === null || valor === undefined) return SIN_DATO;
  return Math.abs(valor) >= 10_000_000 ? dineroCompacto(valor, moneda) : dinero(valor, moneda);
}

export interface OpcionesPorcentaje {
  decimales?: number;
  conSigno?: boolean;
}

function numeroLocal(v: number, decimales: number, conSigno: boolean): string {
  return conMenos(
    nf("es-PA", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
      signDisplay: conSigno ? "exceptZero" : "auto",
    }).format(v),
  );
}

/**
 * Un porcentaje que ya viene en escala 0–100 («28.4 %»), como el que devuelven `sobre()` del EERR y `sobreVentas()` de
 * Rentabilidad. null → «—».
 */
export function porcentaje(valor: number | null | undefined, opciones: OpcionesPorcentaje = {}): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  const { decimales = 1, conSigno = false } = opciones;
  return `${numeroLocal(valor, decimales, conSigno)} %`;
}

/** Una fracción (0,873) como porcentaje («87.3 %»): tasas de entrega, ROAS de margen, coberturas. */
export function fraccion(valor: number | null | undefined, opciones: OpcionesPorcentaje = {}): string {
  return valor === null || valor === undefined ? SIN_DATO : porcentaje(valor * 100, opciones);
}

/** Puntos porcentuales: la diferencia entre dos márgenes («+1.2 pp», «−0.4 pp»). Siempre con signo. */
export function puntos(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  return `${numeroLocal(valor, decimales, true)} pp`;
}

/** Un entero con separador de miles («1,234»). */
export function entero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  return numeroLocal(Math.round(valor), 0, false);
}

/** Un número con decimales fijos («2.5»). */
export function numero(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  return numeroLocal(valor, decimales, false);
}

/** Días («42 días», «1 día»). */
export function dias(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  const n = Math.round(valor);
  return `${entero(n)} ${Math.abs(n) === 1 ? "día" : "días"}`;
}

/** Veces («3.2×»): ROAS, múltiplos de valoración, cobertura. */
export function veces(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  return `${numeroLocal(valor, decimales, false)}×`;
}

/** El signo de un valor, para elegir tono o flecha. */
export type Signo = "positivo" | "negativo" | "cero";
export const signoDe = (v: number): Signo => (esCero(v) ? "cero" : v > 0 ? "positivo" : "negativo");

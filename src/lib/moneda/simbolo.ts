// El símbolo de cada moneda (31 oct 2026, pedido de Alcides: «los precios y valores siempre con el símbolo de la moneda del país en que se están
// viendo»). Un solo lugar para todo el sistema: el dólar es «$», el colón «₡» y el peso mexicano «MX$» (no «$», que se confunde con el dólar).
// Lo que siempre está en dólares (Compras, consumo de IA, Shen Zhen) se escribe «US$» cuando se ve en un país que no usa dólares.

import { monedaDePais } from "./tipo-cambio";

const SIMBOLOS: Record<string, string> = { USD: "$", CRC: "₡", MXN: "MX$", COP: "COL$", GTQ: "Q", PEN: "S/", CLP: "CLP$", HNL: "L", NIO: "C$", VES: "Bs." };

/** «$», «₡», «MX$»… El de una moneda sin símbolo conocido es su código («DOP»). */
export const simboloDeMoneda = (moneda: string): string => SIMBOLOS[moneda.toUpperCase()] ?? moneda.toUpperCase();

/** El símbolo de la moneda del país («PA» → «$», «CR» → «₡», «MX» → «MX$»). */
export const simboloDePais = (codigoPais: string): string => simboloDeMoneda(monedaDePais(codigoPais));

/** El símbolo del dólar visto desde un país: «$» donde se usa el dólar, «US$» donde no (para no confundirlo con la moneda del país). */
export const simboloDolarEn = (codigoPais: string): string => (monedaDePais(codigoPais) === "USD" ? "$" : "US$");

/**
 * Un monto con el símbolo de su moneda: «$8.99», «-$1.20», «₡5 499», «MX$37.50». El dólar siempre con dos decimales; otra moneda, sin
 * decimales si no los tiene. `null` → «—».
 */
export function montoConSimbolo(v: number | null | undefined, moneda: string, opciones: { decimales?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const m = moneda.toUpperCase();
  const signo = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const cifras =
    m === "USD"
      ? abs.toLocaleString("en-US", { minimumFractionDigits: opciones.decimales ?? 2, maximumFractionDigits: opciones.decimales ?? 2 })
      : abs.toLocaleString("es-CR", { minimumFractionDigits: opciones.decimales ?? 0, maximumFractionDigits: opciones.decimales ?? 2 });
  return `${signo}${simboloDeMoneda(m)}${cifras}`;
}

/** Un monto en la moneda del país, con su símbolo. */
export const montoDePais = (v: number | null | undefined, codigoPais: string, opciones?: { decimales?: number }): string =>
  montoConSimbolo(v, monedaDePais(codigoPais), opciones);

// Gestión de IDs Dropi › la moneda de cada país (28 oct 2026, pedido de Hernán, con la primera carga de Costa Rica): los precios, costos
// y utilidades de una publicación están en la moneda de su país de Dropi (Panamá en dólares, Costa Rica en colones: Dropi Costa Rica da
// 5.499, no 10.75). Se muestran en esa moneda y, si no es el dólar, con su valor en dólares en pequeño («US$10.75», como en Scraping de
// proveedores), con el tipo de cambio del día (`tasasUsd`). Sin base ni React.

import { monedaDePais } from "@/lib/moneda/tipo-cambio";

export interface MonedaPublicaciones {
  /** «USD», «CRC»… */
  moneda: string;
  /** Unidades de la moneda por 1 dólar; `null` si es el dólar o no hay tasa (entonces no se muestra el valor en dólares). */
  porUsd: number | null;
}

export const MONEDA_DOLAR: MonedaPublicaciones = { moneda: "USD", porUsd: null };

/** La moneda de las publicaciones de un país, con la tasa del día si no es el dólar. */
export function monedaPublicaciones(codigoPais: string, porUsd: Record<string, number>): MonedaPublicaciones {
  const moneda = monedaDePais(codigoPais);
  if (moneda === "USD") return MONEDA_DOLAR;
  const tasa = porUsd[moneda];
  return { moneda, porUsd: Number.isFinite(tasa) && tasa > 0 ? tasa : null };
}

/** El símbolo para un campo de monto («$», «₡»). */
export function simboloMoneda(m: MonedaPublicaciones): string {
  if (m.moneda === "USD") return "$";
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: m.moneda, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? m.moneda;
}

/**
 * Un monto en la moneda del país: en dólares igual que siempre («$8.99», «-$1.20»); en otra, con su símbolo y sin decimales si no los
 * tiene («₡5 499», «₡5 499,50»), como la escribe ese país. `null` → «—».
 */
export function formatoMonto(v: number | null, m: MonedaPublicaciones): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (m.moneda === "USD") return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: m.moneda, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

/** El mismo monto en dólares («US$10.75»), o `null` si ya está en dólares, no hay tasa o no hay monto. */
export function formatoEnDolares(v: number | null, m: MonedaPublicaciones): string | null {
  if (v === null || !Number.isFinite(v) || m.moneda === "USD" || !m.porUsd) return null;
  const usd = v / m.porUsd;
  return `${usd < 0 ? "-" : ""}US$${Math.abs(usd).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

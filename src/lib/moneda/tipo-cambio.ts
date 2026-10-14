// Tipo de cambio a dólares (14 oct 2026): cuántas unidades de cada moneda vale 1 dólar, una vez al día. Se lee de un servicio
// público (open.er-api.com, sin clave) la primera vez que se necesita en el día y queda en `tipos_cambio` (migración 0106) con
// su fecha; si el servicio no responde se usa el último guardado.

import type { SupabaseClient } from "@supabase/supabase-js";

/** La moneda de cada país de Dropi (código de país en minúsculas, como `scraping_proveedores.pais`). */
export const MONEDA_POR_PAIS: Record<string, string> = {
  mx: "MXN",
  co: "COP",
  cr: "CRC",
  pa: "USD",
  cl: "CLP",
  ec: "USD",
  pe: "PEN",
  gt: "GTQ",
  hn: "HNL",
  ni: "NIO",
  sv: "USD",
  py: "PYG",
  ar: "ARS",
};

const MONEDAS = [...new Set(Object.values(MONEDA_POR_PAIS))].filter((m) => m !== "USD");
const SERVICIO = "https://open.er-api.com/v6/latest/USD";

export const monedaDePais = (pais: string) => MONEDA_POR_PAIS[pais.toLowerCase()] ?? "USD";

/** Hoy en Panamá (AAAA-MM-DD), la misma fecha que usa el resto del sistema. */
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

export interface TasasUsd {
  /** Unidades de la moneda por 1 dólar (USD = 1). */
  porUsd: Record<string, number>;
  /** Fecha de las tasas (AAAA-MM-DD) o `null` si no hay ninguna. */
  fecha: string | null;
}

/** Las tasas del día; si aún no están, las pide al servicio y las guarda. Sin tabla o sin datos devuelve solo USD. */
export async function tasasUsd(supabase: SupabaseClient): Promise<TasasUsd> {
  const fecha = hoy();
  const leer = async (f?: string) => {
    let q = supabase.from("tipos_cambio").select("fecha, moneda, por_usd").order("fecha", { ascending: false }).limit(200);
    if (f) q = q.eq("fecha", f);
    const { data, error } = await q;
    return error ? null : (data ?? []);
  };
  let filas = await leer(fecha);
  if (filas === null) return { porUsd: { USD: 1 }, fecha: null };
  if (!filas.length) {
    try {
      const r = await fetch(SERVICIO, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
      const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
      if (r.ok && j.result === "success" && j.rates) {
        const nuevas = MONEDAS.filter((m) => Number.isFinite(j.rates![m]) && j.rates![m] > 0).map((m) => ({ fecha, moneda: m, por_usd: j.rates![m], fuente: "open.er-api.com" }));
        if (nuevas.length) await supabase.from("tipos_cambio").upsert(nuevas, { onConflict: "fecha,moneda" });
      }
    } catch {
      // Sin servicio: se usa la última tasa guardada.
    }
    filas = (await leer()) ?? [];
  }
  const porUsd: Record<string, number> = { USD: 1 };
  let ultima: string | null = null;
  for (const f of filas) {
    if (porUsd[f.moneda] === undefined) porUsd[f.moneda] = Number(f.por_usd);
    if (!ultima || f.fecha > ultima) ultima = f.fecha;
  }
  return { porUsd, fecha: ultima };
}

/** Un valor en su moneda pasado a dólares (2 decimales), o `null` si no hay tasa. */
export function aDolares(valor: number | null, moneda: string, tasas: Record<string, number>): number | null {
  if (valor === null) return null;
  const tasa = tasas[moneda];
  return tasa ? Math.round((valor / tasa) * 100) / 100 : null;
}

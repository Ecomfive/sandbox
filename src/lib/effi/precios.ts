// Gestión de IDs Effi: armar el cambio de precios de un artículo para `PUT api/articulo` (9 nov 2026, pedido de Hernán: que Nicol
// cambie los precios desde el sistema, como en Dropi). Lógica pura.
//
// Ojo con Effi: si se mandan `precios`, reemplazan TODAS las tarifas y las vigentes que no van quedan en 0. Por eso se manda cada
// tarifa vigente con su valor actual (leído de `precios_venta` justo antes) y solo cambian Dropshipping y Sugerida. Si alguna tarifa
// vigente no se puede leer, no se manda nada.

import { montoEffi, sinTildes, tarifasEffi } from "./articulos";

export interface TarifaEffi {
  id: number;
  nombre: string;
}

export interface CambioPreciosEffi {
  /** Tarifa Dropshipping (lo que paga el dropshipper). */
  precio?: number;
  /** Tarifa Sugerida (el precio de venta sugerido al cliente final). */
  precioSugerido?: number;
  /** Precio mínimo de venta (`p_min_venta`). */
  precioMinimo?: number;
}

export type CuerpoPreciosEffi = { id: number; precios?: { tarifa_precio: number; p_venta: number }[]; p_min_venta?: number };

/** El tope de un precio, para atajar un cero de más (en colones: ₡10 millones). */
export const MAX_PRECIO_EFFI = 10_000_000;

/** Un precio escrito por la persona: número ≥ 0 y con 2 decimales como mucho. `null` si no vale. */
export function precioValido(v: unknown): number | null {
  const n = typeof v === "number" ? v : montoEffi(v);
  if (n === null || !Number.isFinite(n) || n < 0 || n > MAX_PRECIO_EFFI) return null;
  return Math.round(n * 100) / 100;
}

/** La única tarifa vigente cuyo nombre lleva esa palabra («dropshipping», «sugerid»); error si no hay o hay más de una. */
function tarifaUnica(tarifas: TarifaEffi[], palabra: string, etiqueta: string): TarifaEffi | { error: string } {
  const con = tarifas.filter((t) => sinTildes(t.nombre).includes(palabra));
  if (con.length === 1) return con[0];
  return { error: con.length ? `En Effi hay varias tarifas con «${etiqueta}» en el nombre: no se sabe cuál cambiar.` : `En Effi no hay una tarifa vigente «${etiqueta}».` };
}

/**
 * El cuerpo del `PUT api/articulo`: todas las tarifas vigentes (las que no cambian, con su valor actual) y, si cambia, el precio
 * mínimo. `textoTarifas` es el `precios_venta` del artículo recién leído; `vigentes`, `api/tarifa_precio`.
 */
export function armarPreciosEffi(effiId: number, textoTarifas: unknown, vigentes: TarifaEffi[], cambio: CambioPreciosEffi): CuerpoPreciosEffi | { error: string } {
  const cuerpo: CuerpoPreciosEffi = { id: effiId };
  if (cambio.precio !== undefined || cambio.precioSugerido !== undefined) {
    if (!vigentes.length) return { error: "Effi no devolvió sus tarifas de precio." };
    const actuales = tarifasEffi(textoTarifas);
    const precios: { tarifa_precio: number; p_venta: number }[] = [];
    for (const t of vigentes) {
      const valor = actuales.get(sinTildes(t.nombre));
      if (valor === undefined) return { error: `No se pudo leer en Effi el precio actual de la tarifa «${t.nombre}»: no se cambió nada para no dejarla en 0.` };
      precios.push({ tarifa_precio: t.id, p_venta: valor });
    }
    for (const [valor, palabra, etiqueta] of [
      [cambio.precio, "dropshipping", "Dropshipping"],
      [cambio.precioSugerido, "sugerid", "Sugerida"],
    ] as const) {
      if (valor === undefined) continue;
      const t = tarifaUnica(vigentes, palabra, etiqueta);
      if ("error" in t) return t;
      precios.find((x) => x.tarifa_precio === t.id)!.p_venta = valor;
    }
    cuerpo.precios = precios;
  }
  if (cambio.precioMinimo !== undefined) cuerpo.p_min_venta = cambio.precioMinimo;
  if (!cuerpo.precios && cuerpo.p_min_venta === undefined) return { error: "No hay ningún precio que cambiar." };
  return cuerpo;
}

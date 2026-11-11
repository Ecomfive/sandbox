// El costo de una publicación de Drop (10 nov 2026, pedido de Hernán). Sale de Gestión de IDs Dropi del país: primero el de su producto; si es una variante sin costo,
// el de otra variante del mismo producto (o del principal), que es el mismo artículo en otro color o tamaño; si no hay ninguno, el escrito a mano en la ficha; y si
// tampoco, el de Compras (lo que costó por unidad en la orden más reciente, del país si hay, en dólares y pasado a la moneda del país; pedido de Hernán, 10 nov 2026).
// Sin base ni React, con prueba.

export type OrigenCosto = "dropi" | "variante" | "manual" | "compras";

export interface CostoDrop {
  costo: number | null;
  origen: OrigenCosto | null;
  /** El SKU de la variante de donde se tomó, con origen «variante»; la orden de compra y su costo en dólares, con origen «compras». */
  de: string | null;
}

/** El costo por unidad de un producto en Compras: la orden más reciente, del país si hay. */
export interface CostoCompra {
  usd: number;
  orden: string;
  mismoPais: boolean;
}

export interface ProductoFamilia {
  id: string;
  codigo: string;
  padreId: string | null;
}

/**
 * `costos`: el costo en Dropi del país de cada producto que lo tiene (el más reciente). `familia`: los productos vinculados, sus hermanos y su principal. El de otra
 * variante va en el orden de `familia`: el principal primero, luego las demás por SKU.
 */
export function costoDrop(
  skuId: string | null,
  costos: ReadonlyMap<string, number>,
  familia: readonly ProductoFamilia[],
  manual: number | null,
  compra: CostoCompra | null = null,
  porUsd: number | null = null,
): CostoDrop {
  if (!skuId) return { costo: null, origen: null, de: null };
  const propio = costos.get(skuId);
  if (propio !== undefined) return { costo: propio, origen: "dropi", de: null };
  const yo = familia.find((f) => f.id === skuId);
  const grupo = yo?.padreId ?? (familia.some((f) => f.padreId === skuId) ? skuId : null);
  if (grupo) {
    const parientes = familia
      .filter((f) => f.id !== skuId && (f.id === grupo || f.padreId === grupo))
      .sort((a, b) => (a.id === grupo ? -1 : b.id === grupo ? 1 : a.codigo.localeCompare(b.codigo)));
    const conCosto = parientes.find((f) => costos.has(f.id));
    if (conCosto) return { costo: costos.get(conCosto.id)!, origen: "variante", de: conCosto.codigo };
  }
  if (manual !== null) return { costo: manual, origen: "manual", de: null };
  if (compra) {
    const costo = Math.round(compra.usd * (porUsd ?? 1) * 100) / 100;
    return { costo, origen: "compras", de: `${compra.orden} · US$${compra.usd.toLocaleString("es-PA", { maximumFractionDigits: 2 })}${compra.mismoPais ? "" : " (de otro país)"}` };
  }
  return { costo: null, origen: null, de: null };
}

/** De las compras de un producto, la que vale: la más reciente del país; si no hay del país, la más reciente de cualquiera. */
export function compraQueVale(lineas: readonly { usd: number; orden: string; paisId: string; fecha: string }[], paisId: string): CostoCompra | null {
  const validas = lineas.filter((l) => l.usd > 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const delPais = validas.find((l) => l.paisId === paisId);
  const l = delPais ?? validas[0];
  return l ? { usd: l.usd, orden: l.orden, mismoPais: !!delPais } : null;
}

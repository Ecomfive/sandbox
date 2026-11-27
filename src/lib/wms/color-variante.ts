import { etiquetaTalla } from "./talla";

/**
 * El color de una variante que además tiene otra opción (talla…): con él se agrupan las variantes de un producto en el Levantamiento y en Inventario › Stock
 * (23 nov 2026, pedido de Jhokser: en Stock se veían las 24 variantes seguidas y en Levantamiento agrupadas por color). `resto` es lo demás («M», «43»).
 * Una variante solo de color, o sin color, no se agrupa.
 */
export function colorDeVariante(opciones: Record<string, string> | null | undefined): { color: string | null; resto: string } {
  const pares = Object.entries(opciones ?? {}).filter(([, v]) => String(v ?? "").trim() !== "");
  const color = pares.find(([k]) => /^(colou?r|tono)$/i.test(k.trim()));
  if (!color || pares.length < 2) return { color: null, resto: "" };
  return { color: String(color[1]).trim(), resto: etiquetaTalla(pares.filter((x) => x !== color).map(([, v]) => v).join(" / ")) };
}

/** Agrupa por color, en el orden en que salen: las que no tienen color (o solo color) van sueltas, primero. */
export function agruparPorColor<T extends { color: string | null }>(hijos: readonly T[]): { color: string | null; hijos: T[] }[] {
  const sueltas = hijos.filter((h) => !h.color);
  const grupos = new Map<string, T[]>();
  for (const h of hijos) if (h.color) grupos.set(h.color, [...(grupos.get(h.color) ?? []), h]);
  return [...(sueltas.length ? [{ color: null, hijos: sueltas }] : []), ...[...grupos].map(([color, lista]) => ({ color, hijos: lista }))];
}

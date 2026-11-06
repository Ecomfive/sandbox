/** La remisión como documento: el número y la revisión de sus líneas antes de llegar a la base (`wms_crear_remision`, migración 0233). Lógica pura, con prueba. */

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const MAX_CANTIDAD = 1_000_000;

/** Cuántos productos caben en una remisión. */
export const MAX_LINEAS_REMISION = 200;

export interface LineaRemision {
  sku: string;
  cantidad: number;
}

/** «REM-0012»: el número que sale en el papel y en la lista. */
export const numeroRemision = (n: number) => `REM-${String(n).padStart(4, "0")}`;

/** Revisa las líneas de una remisión. Devuelve las listas para la base o el primer error, en palabras. */
export function revisarLineasRemision(lineas: unknown): { lineas: LineaRemision[] } | { error: string } {
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "Agrega al menos un producto." };
  if (lineas.length > MAX_LINEAS_REMISION) return { error: `Son demasiados productos en una remisión (máximo ${MAX_LINEAS_REMISION}).` };
  const vistos = new Set<string>();
  const limpias: LineaRemision[] = [];
  for (const l of lineas) {
    const o = (l ?? {}) as Record<string, unknown>;
    const sku = typeof o.sku === "string" ? o.sku : "";
    if (!ES_ID.test(sku)) return { error: "Un producto de la remisión no es válido." };
    if (vistos.has(sku)) return { error: "Un producto está dos veces en la remisión." };
    vistos.add(sku);
    const cantidad = Number(o.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD) return { error: "Cada producto necesita una cantidad entera mayor que cero." };
    limpias.push({ sku, cantidad });
  }
  return { lineas: limpias };
}

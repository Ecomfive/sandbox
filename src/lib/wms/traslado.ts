/** Los traslados entre bodegas propias (migración 0235): el número y la revisión de sus líneas antes de llegar a la base (`wms_crear_traslado`). Lógica pura, con prueba. */

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const MAX_CANTIDAD = 1_000_000;

/** Cuántos productos caben en un traslado. */
export const MAX_LINEAS_TRASLADO = 200;
/** Lo más largo que puede ser la nota de un traslado. */
export const MAX_NOTA_TRASLADO = 500;

export interface LineaTraslado {
  sku: string;
  cantidad: number;
}

/** «TRA-0012»: el número de un traslado. */
export const numeroTraslado = (n: number) => `TRA-${String(n).padStart(4, "0")}`;

/** Revisa las líneas de un traslado. Devuelve las listas para la base o el primer error, en palabras. */
export function revisarLineasTraslado(lineas: unknown): { lineas: LineaTraslado[] } | { error: string } {
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "Agrega al menos un producto." };
  if (lineas.length > MAX_LINEAS_TRASLADO) return { error: `Son demasiados productos en un traslado (máximo ${MAX_LINEAS_TRASLADO}).` };
  const vistos = new Set<string>();
  const limpias: LineaTraslado[] = [];
  for (const l of lineas) {
    const o = (l ?? {}) as Record<string, unknown>;
    const sku = typeof o.sku === "string" ? o.sku : "";
    if (!ES_ID.test(sku)) return { error: "Un producto del traslado no es válido." };
    if (vistos.has(sku)) return { error: "Un producto está dos veces en el traslado." };
    vistos.add(sku);
    const cantidad = Number(o.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD) return { error: "Cada producto necesita una cantidad entera mayor que cero." };
    limpias.push({ sku, cantidad });
  }
  return { lineas: limpias };
}

/** Los traslados entre bodegas propias (migración 0235): el número y la revisión de sus líneas antes de llegar a la base (`wms_crear_traslado`). Lógica pura, con prueba. */

import { textoCajasEnviadas } from "./cajas";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const MAX_CANTIDAD = 1_000_000;

/** Cuántos productos caben en un traslado. */
export const MAX_LINEAS_TRASLADO = 200;
/** Lo más largo que puede ser la nota de un traslado. */
export const MAX_NOTA_TRASLADO = 500;

export interface LineaTraslado {
  sku: string;
  cantidad: number;
  /** Las cajas elegidas (migración 0238): `id` de `wms_cajas` y cuántas. */
  cajas?: { id: string; cajas: number }[];
  /** En qué ubicación del destino quedan, si esa bodega tiene ubicaciones. */
  ubicacion_destino?: string;
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
    const cajas: { id: string; cajas: number }[] = [];
    for (const e of Array.isArray(o.cajas) ? o.cajas : []) {
      const x = (e ?? {}) as Record<string, unknown>;
      const n = Number(x.cajas);
      if (typeof x.id !== "string" || !ES_ID.test(x.id) || !Number.isInteger(n) || n <= 0 || n > MAX_CANTIDAD) return { error: "Las cajas elegidas no son válidas." };
      cajas.push({ id: x.id, cajas: n });
    }
    const destino = typeof o.ubicacion_destino === "string" && ES_ID.test(o.ubicacion_destino) ? o.ubicacion_destino : null;
    limpias.push({ sku, cantidad, ...(cajas.length ? { cajas } : {}), ...(cajas.length && destino ? { ubicacion_destino: destino } : {}) });
  }
  return { lineas: limpias };
}

/** Qué cajas se movieron en una línea, en palabras: «3 cajas de 175 (C1) → C2». Sin cajas, `null`. */
export function textoCajasTraslado(cajas: unknown): string | null {
  const texto = textoCajasEnviadas(cajas);
  if (!texto) return null;
  const destino = (cajas as { destino?: string | null }[])[0]?.destino;
  return destino ? `${texto} → ${destino}` : texto;
}

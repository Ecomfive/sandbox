// Cajas por producto y ubicación (7 nov 2026, pedido de Hernán, a través de Yanixia y Nicol; migración 0235): cuántas cajas hay, de qué tamaño y dónde. Un mismo
// producto suele tener cajas de varios tamaños («16 de 175 y 1 de 58»), por eso va una línea por tamaño y lugar. Lógica pura, con prueba.

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const MAX_ENTERO = 1_000_000;
export const MAX_LINEAS_CAJAS = 100;

/** Una línea del levantamiento: tantas cajas de tanto en tal ubicación. */
export interface LineaCajas {
  ubicacion: string;
  cajas: number;
  por_caja: number;
  observacion: string | null;
}

export interface CajasDeProducto {
  sku: string;
  lineas: LineaCajas[];
}

/** Cajas guardadas de un producto en una bodega, para verlas y para elegirlas en una remisión. */
export interface CajaGuardada {
  id: string;
  ubicacion: string;
  /** El nombre del lugar («Cuarto 1»), si tiene. */
  lugar: string | null;
  cajas: number;
  porCaja: number;
  observacion: string | null;
}

/** Las cajas que salieron en una línea de remisión (`wms_envios_dropi.cajas`). */
export interface CajasEnviadas {
  ubicacion: string;
  cajas: number;
  por_caja: number;
}

const entero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 && n <= MAX_ENTERO ? n : null;
};

export const unidadesDeCajas = (lineas: readonly { cajas: number; porCaja: number }[]) => lineas.reduce((t, l) => t + l.cajas * l.porCaja, 0);
export const cuantasCajas = (lineas: readonly { cajas: number }[]) => lineas.reduce((t, l) => t + l.cajas, 0);

const plural = (n: number) => `${n.toLocaleString("es-PA")} ${n === 1 ? "caja" : "cajas"}`;

/** «3 cajas de 175 (C1)»: como se lee una línea en la lista, la ficha y el papel. */
export const textoCaja = (c: { cajas: number; porCaja: number; ubicacion?: string | null }) =>
  `${plural(c.cajas)} de ${c.porCaja.toLocaleString("es-PA")}${c.ubicacion ? ` (${c.ubicacion})` : ""}`;

/** Lo que salió en una línea de remisión, en palabras. Sin cajas, `null`. */
export function textoCajasEnviadas(cajas: unknown): string | null {
  if (!Array.isArray(cajas) || cajas.length === 0) return null;
  return (cajas as CajasEnviadas[]).map((c) => textoCaja({ cajas: c.cajas, porCaja: c.por_caja, ubicacion: c.ubicacion })).join(" · ");
}

/**
 * Las cajas de un levantamiento, listas para la base (`wms_guardar_cajas`) o el primer error, en palabras. Una línea sin cajas ni cantidad se ignora (quedó en
 * blanco); un producto con todas sus líneas vacías se queda sin cajas. Dos líneas iguales (mismo lugar y tamaño) se juntan.
 */
export function revisarCajas(entrada: unknown): { cajas: CajasDeProducto[] } | { error: string } {
  if (entrada === undefined || entrada === null) return { cajas: [] };
  if (!Array.isArray(entrada)) return { error: "Las cajas no son válidas." };
  const vistos = new Set<string>();
  const salida: CajasDeProducto[] = [];
  for (const it of entrada) {
    const o = (it ?? {}) as Record<string, unknown>;
    const sku = typeof o.sku === "string" ? o.sku : "";
    if (!ES_ID.test(sku)) return { error: "Un producto de las cajas no es válido." };
    if (vistos.has(sku)) return { error: "Un producto viene dos veces en las cajas." };
    vistos.add(sku);
    const crudas = Array.isArray(o.lineas) ? o.lineas : [];
    if (crudas.length > MAX_LINEAS_CAJAS) return { error: `Son demasiadas líneas de cajas en un producto (máximo ${MAX_LINEAS_CAJAS}).` };
    const juntas = new Map<string, LineaCajas>();
    for (const l of crudas) {
      const x = (l ?? {}) as Record<string, unknown>;
      const vacia = [x.cajas, x.por_caja].every((v) => v === "" || v === null || v === undefined);
      if (vacia) continue;
      const ubicacion = typeof x.ubicacion === "string" ? x.ubicacion : "";
      if (!ES_ID.test(ubicacion)) return { error: "Elige la ubicación de cada línea de cajas." };
      const cajas = entero(x.cajas);
      const por_caja = entero(x.por_caja);
      if (cajas === null || por_caja === null) return { error: "Cada línea necesita cuántas cajas y cuántas unidades por caja." };
      const observacion = typeof x.observacion === "string" ? x.observacion.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
      const clave = `${ubicacion}|${por_caja}`;
      const previa = juntas.get(clave);
      if (previa) previa.cajas += cajas;
      else juntas.set(clave, { ubicacion, cajas, por_caja, observacion });
    }
    salida.push({ sku, lineas: [...juntas.values()] });
  }
  return { cajas: salida };
}

/** La remisión como documento: el número y la revisión de sus líneas antes de llegar a la base (`wms_crear_remision`, migración 0233). Lógica pura, con prueba. */

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const MAX_CANTIDAD = 1_000_000;

/** Cuántos productos caben en una remisión. */
export const MAX_LINEAS_REMISION = 200;

export interface LineaRemision {
  sku: string;
  cantidad: number;
  /** Las cajas elegidas (migración 0236): `id` de `wms_cajas` y cuántas. */
  cajas?: { id: string; cajas: number }[];
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
    const elegidas = Array.isArray(o.cajas) ? o.cajas : [];
    const cajas: { id: string; cajas: number }[] = [];
    for (const c of elegidas) {
      const x = (c ?? {}) as Record<string, unknown>;
      const n = Number(x.cajas);
      if (typeof x.id !== "string" || !ES_ID.test(x.id) || !Number.isInteger(n) || n <= 0 || n > MAX_CANTIDAD) return { error: "Las cajas elegidas no son válidas." };
      cajas.push({ id: x.id, cajas: n });
    }
    limpias.push(cajas.length ? { sku, cantidad, cajas } : { sku, cantidad });
  }
  return { lineas: limpias };
}

/** Lo que la lista necesita de cada línea enviada (`wms_envios_dropi`). */
export interface LineaEnviada {
  id: string;
  /** La remisión a la que pertenece; una línea anterior a la migración 0233 no tiene. */
  remisionId: string | null;
  referencia: string | null;
  desde: string;
  hacia: string;
  enviadoEn: string;
  enviada: number;
  recibida: number | null;
  estado: "en_camino" | "recibido" | "anulado";
  notas: string | null;
}

export type EstadoRemision = "en_camino" | "parcial" | "completa" | "diferencia" | "anulada";

/** Una remisión con sus totales: lo que se ve en una fila de la lista. Las líneas van en la ficha. */
export interface RemisionAgrupada<L extends LineaEnviada = LineaEnviada> {
  /** El id de la remisión o, en una línea suelta, el de la línea. */
  clave: string;
  remisionId: string | null;
  numero: string;
  desde: string;
  hacia: string;
  enviadoEn: string;
  notas: string | null;
  productos: number;
  enviadas: number;
  /** Lo confirmado hasta ahora (las líneas en camino no suman). */
  recibidas: number;
  /** Cuántas líneas faltan por confirmar. */
  porConfirmar: number;
  /** Lo que llegó menos lo que se envió, solo de las líneas ya confirmadas. */
  diferencia: number;
  estado: EstadoRemision;
  lineas: L[];
}

/**
 * Las líneas enviadas, una fila por remisión (7 nov 2026, pedido de Hernán: la lista principal mostraba cada producto). Primero lo que falta por
 * confirmar, luego lo más nuevo. Una remisión con diferencia sale como tal aunque le falten líneas por confirmar.
 */
export function agruparRemisiones<L extends LineaEnviada>(lineas: readonly L[]): RemisionAgrupada<L>[] {
  const grupos = new Map<string, L[]>();
  for (const l of lineas) {
    const clave = l.remisionId ?? l.id;
    grupos.set(clave, [...(grupos.get(clave) ?? []), l]);
  }
  const salida = [...grupos.entries()].map(([clave, ls]): RemisionAgrupada<L> => {
    const p = ls[0];
    // Una línea anulada (migración 0234) volvió a la bodega: no cuenta en los totales, pero sigue a la vista en la ficha.
    const vivas = ls.filter((l) => l.estado !== "anulado");
    const confirmadas = vivas.filter((l) => l.estado === "recibido");
    const porConfirmar = vivas.length - confirmadas.length;
    const recibidas = confirmadas.reduce((t, l) => t + (l.recibida ?? 0), 0);
    const conDiferencia = confirmadas.some((l) => l.recibida !== l.enviada);
    return {
      clave,
      remisionId: p.remisionId,
      numero: p.referencia?.trim() || "Sin número",
      desde: p.desde,
      hacia: p.hacia,
      enviadoEn: p.enviadoEn,
      notas: p.notas,
      productos: vivas.length,
      enviadas: vivas.reduce((t, l) => t + l.enviada, 0),
      recibidas,
      porConfirmar,
      diferencia: confirmadas.reduce((t, l) => t + ((l.recibida ?? 0) - l.enviada), 0),
      estado: !vivas.length ? "anulada" : conDiferencia ? "diferencia" : porConfirmar === 0 ? "completa" : confirmadas.length ? "parcial" : "en_camino",
      lineas: ls,
    };
  });
  return salida.sort((a, b) => Number(b.porConfirmar > 0) - Number(a.porConfirmar > 0) || b.enviadoEn.localeCompare(a.enviadoEn));
}

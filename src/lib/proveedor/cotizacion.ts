// Portal del proveedor: la cotización que pone el proveedor (costo por unidad, total y unidades por caja). Lógica pura.

/** Unidades que se aceptan en una cotización (una caja suelta hasta un contenedor de bolsas). */
export const MAX_UNIDADES = 1_000_000;
/** Monto máximo de una cotización, para atajar un cero de más. */
export const MAX_MONTO = 1_000_000;

export const totalDesdeUnitario = (unitario: number, unidades: number) => Math.round(unitario * unidades * 100) / 100;
export const unitarioDesdeTotal = (total: number, unidades: number) => (unidades > 0 ? Math.round((total / unidades) * 10000) / 10000 : 0);

export interface CotizacionValida {
  unidades: number;
  costoUnitario: number;
  montoTotal: number;
}

/**
 * Valida lo que manda el proveedor. Basta el costo por unidad o el total (el otro se calcula con las unidades); si vienen los dos,
 * manda el total. Devuelve el error como texto.
 */
export function validarCotizacion(entrada: { unidades: unknown; costoUnitario?: unknown; montoTotal?: unknown }): CotizacionValida | { error: string } {
  const unidades = numero(entrada.unidades);
  if (unidades == null || !Number.isInteger(unidades) || unidades < 1 || unidades > MAX_UNIDADES) return { error: "Las unidades deben ser un número entero mayor que cero." };
  const total = numero(entrada.montoTotal);
  const unitario = numero(entrada.costoUnitario);
  if (total != null) {
    if (total <= 0 || total > MAX_MONTO) return { error: "El total debe ser mayor que cero." };
    return { unidades, montoTotal: Math.round(total * 100) / 100, costoUnitario: unitarioDesdeTotal(total, unidades) };
  }
  if (unitario != null) {
    if (unitario <= 0 || unitario * unidades > MAX_MONTO) return { error: "El costo por unidad debe ser mayor que cero." };
    return { unidades, costoUnitario: Math.round(unitario * 10000) / 10000, montoTotal: totalDesdeUnitario(unitario, unidades) };
  }
  return { error: "Falta el costo por unidad o el total." };
}

/** Si el proveedor cotizó otras unidades que las pedidas (la caja trae 960 y se pidieron 1,000). */
export function cambioDeUnidades(pedidas: number | null, cotizadas: number | null): { pedidas: number; cotizadas: number } | null {
  if (pedidas == null || cotizadas == null || pedidas === cotizadas) return null;
  return { pedidas, cotizadas };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

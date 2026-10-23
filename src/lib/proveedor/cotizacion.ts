// Portal del proveedor: la cotización que pone el proveedor (unidades y monto total; el costo por unidad sale de la fórmula). Lógica pura.

/** Unidades que se aceptan en una cotización (una caja suelta hasta un contenedor de bolsas). */
export const MAX_UNIDADES = 1_000_000;
/** Monto máximo de una cotización, para atajar un cero de más. */
export const MAX_MONTO = 1_000_000;

/** El costo por unidad de una cotización: monto total ÷ unidades, con 4 decimales. */
export const unitarioDesdeTotal = (total: number, unidades: number) => (unidades > 0 ? Math.round((total / unidades) * 10000) / 10000 : 0);

export interface CotizacionValida {
  unidades: number;
  costoUnitario: number;
  montoTotal: number;
}

/**
 * Valida lo que manda el proveedor: las unidades y el monto total (desde el 23 oct 2026, pedido de Hernán, ya no escribe el costo por
 * unidad). El costo por unidad se calcula siempre con `unitarioDesdeTotal`. Devuelve el error como texto.
 */
export function validarCotizacion(entrada: { unidades: unknown; montoTotal?: unknown }): CotizacionValida | { error: string } {
  const unidades = numero(entrada.unidades);
  if (unidades == null || !Number.isInteger(unidades) || unidades < 1 || unidades > MAX_UNIDADES) return { error: "Las unidades deben ser un número entero mayor que cero." };
  const total = numero(entrada.montoTotal);
  if (total == null) return { error: "Falta el monto total." };
  if (total <= 0 || total > MAX_MONTO) return { error: "El total debe ser mayor que cero." };
  const montoTotal = Math.round(total * 100) / 100;
  return { unidades, montoTotal, costoUnitario: unitarioDesdeTotal(montoTotal, unidades) };
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

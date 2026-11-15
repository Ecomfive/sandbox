// Repartir el stock general de un producto entre sus variantes (11 nov 2026, pedido de Jhokser). Un producto con variantes puede conservar su stock como general («pendiente de repartir»,
// migración 0273) mientras se cuenta cuánto hay de cada variante; esto revisa un reparto antes de mandarlo a la base y dice, bodega por bodega, cuánto queda sin repartir o se pasó. Desde
// el 14 nov 2026 (migración 0296) se puede repartir solo algunas bodegas, o solo una parte de una bodega: lo que no se reparte sigue como stock general. La base lo vuelve a comprobar
// (`wms_repartir_stock_variantes`). Lógica pura, con su prueba.

/** Lo que el producto principal tiene como stock general en una bodega propia. */
export interface StockGeneral {
  bodegaId: string;
  nombre: string;
  fisico: number;
}

/** Cuántas unidades de una bodega se le asignan a una variante. */
export interface LineaReparto {
  varianteId: string;
  bodegaId: string;
  cantidad: number;
}

export interface ResumenBodega {
  bodegaId: string;
  nombre: string;
  general: number;
  repartido: number;
  /** Lo que queda sin repartir (positivo) o se pasó (negativo). */
  falta: number;
}

export interface RevisionReparto {
  porBodega: ResumenBodega[];
  /** El reparto se puede guardar: cantidades válidas y en ninguna bodega se reparte más de lo que hay. */
  valido: boolean;
  /** Además, todo el stock general quedó repartido (no queda nada sin repartir). */
  completo: boolean;
  /** Cuántas unidades se reparten en total. */
  total: number;
  /** El primer problema, dicho en palabras; null si el reparto es válido. */
  error: string | null;
}

const esCantidad = (n: number) => Number.isInteger(n) && n >= 0 && n <= 1_000_000;

/** Revisa un reparto contra el stock general: cantidades enteras de 0 o más y, en cada bodega, no repartir más de lo que hay (lo que no se reparte sigue como stock general). */
export function revisarReparto(general: readonly StockGeneral[], lineas: readonly LineaReparto[]): RevisionReparto {
  const porBodega = general.map((g) => {
    const repartido = lineas.filter((l) => l.bodegaId === g.bodegaId).reduce((t, l) => t + (Number.isFinite(l.cantidad) ? l.cantidad : 0), 0);
    return { bodegaId: g.bodegaId, nombre: g.nombre, general: g.fisico, repartido, falta: g.fisico - repartido };
  });
  const total = lineas.reduce((t, l) => t + (Number.isFinite(l.cantidad) ? l.cantidad : 0), 0);
  if (lineas.some((l) => !esCantidad(l.cantidad))) return { porBodega, valido: false, completo: false, total, error: "Las cantidades son números enteros de 0 o más." };
  const bodegasConocidas = new Set(general.map((g) => g.bodegaId));
  if (lineas.some((l) => l.cantidad > 0 && !bodegasConocidas.has(l.bodegaId))) return { porBodega, valido: false, completo: false, total, error: "Hay unidades en una bodega donde el producto no tiene stock general." };
  // Un saldo negativo solo estorba en la bodega donde se reparte algo.
  const negativa = porBodega.find((b) => b.general < 0 && b.repartido > 0);
  if (negativa) return { porBodega, valido: false, completo: false, total, error: `El stock general de ${negativa.nombre} está en negativo (${negativa.general}): corrígelo con un ajuste antes de repartir.` };
  const pasada = porBodega.find((b) => b.repartido > Math.max(b.general, 0));
  if (pasada) return { porBodega, valido: false, completo: false, total, error: `En ${pasada.nombre} te pasaste por ${-pasada.falta}.` };
  return { porBodega, valido: true, completo: porBodega.every((b) => b.falta === 0), total, error: null };
}

/**
 * El motivo que la base da cuando se niega a repartir o a dejar el stock sin repartir viene escrito para el equipo y se muestra tal cual; cualquier otro error de la base no se
 * enseña.
 */
export function mensajeErrorReparto(mensaje: string | null | undefined): string {
  const m = (mensaje ?? "").trim();
  return /^(El reparto|En .+ hay que repartir|En .+ se pueden repartir|El stock general|Este producto no tiene|Una de las|Una variante|El producto no|Un producto con vencimiento|Después de repartir|La cantidad)/.test(m) ? m : "No se pudo hacer el reparto.";
}

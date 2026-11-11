/**
 * Con cuántos días de anticipación se avisa que un lote está por vencer si el producto no dice otra cosa (13 oct 2026: 90,
 * antes 60). Se guarda en el producto al activar el vencimiento, así las funciones de la base no dependen de su propio valor.
 */
export const DIAS_AVISO_PREDETERMINADO = 90;

/**
 * Si se puede activar el vencimiento de un producto (11 nov 2026, pedido de Hernán: por ahora el inventario no usa lotes; tras quitarlo a los 34 que lo tenían,
 * se volvió a activar en uno desde su ficha). Con `false` no sale «Activar el vencimiento» en la ficha ni la casilla al crear un producto, y el servidor lo rechaza.
 * Desactivarlo sigue permitido.
 */
export const VENCIMIENTO_ACTIVABLE = false;

/**
 * Si se pide el código del lote al cargar un producto con vencimiento (9 nov 2026, pedido de Hernán: «el lote lo ponemos cuando descubramos qué poner»): por
 * ahora no. Solo se pide la fecha de vencimiento y el lote se nombra con ella (`codigoLote`), así que las unidades que vencen el mismo día van al mismo lote. Con
 * `true` vuelve el campo «Lote» en Entrada, Levantamiento y Recepción (y si se deja vacío, igual se nombra con la fecha).
 */
export const PEDIR_CODIGO_LOTE = false;

/** El código de un lote: el escrito o, si no hay, «Vence 2029-08-18» con su fecha de vencimiento (AAAA-MM-DD). Vacío si no hay ninguno de los dos. */
export function codigoLote(codigo: string | null | undefined, vencimiento: string | null | undefined): string {
  const c = (codigo ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (c) return c;
  const v = (vencimiento ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `Vence ${v}` : "";
}

/**
 * La suma de una cifra del inventario (5 nov 2026, pedido de Hernán, para cuadrar el levantamiento). Sin los compuestos: su stock no existe aparte, es cuántos se
 * pueden armar con sus componentes (`wms_stock_resumen`), así que sumarlos contaría dos veces las mismas unidades.
 */
export function sumaSinCompuestos<F extends { tipo: string }>(filas: F[], valor: (f: F) => number): number {
  return filas.reduce((suma, f) => (f.tipo === "combo" ? suma : suma + valor(f)), 0);
}

/**
 * Lo que pide atención va primero: los saldos negativos, luego lo que tiene stock y al final lo que está en cero, sin cambiar el orden dentro de cada parte.
 * `fuera` son las unidades que tiene en otra parte (en las plataformas): con ellas un producto no cuenta como en cero.
 */
export function conStockPrimero<F extends { fisico: number }>(filas: F[], fuera: (f: F) => number = () => 0): F[] {
  const lugar = (f: F) => (f.fisico < 0 ? 0 : f.fisico > 0 || fuera(f) > 0 ? 1 : 2);
  return [...filas].sort((a, b) => lugar(a) - lugar(b));
}

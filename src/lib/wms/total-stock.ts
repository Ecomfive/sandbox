/**
 * La suma de una cifra del inventario (5 nov 2026, pedido de Hernán, para cuadrar el levantamiento). Sin los compuestos: su stock no existe aparte, es cuántos se
 * pueden armar con sus componentes (`wms_stock_resumen`), así que sumarlos contaría dos veces las mismas unidades.
 */
export function sumaSinCompuestos<F extends { tipo: string }>(filas: F[], valor: (f: F) => number): number {
  return filas.reduce((suma, f) => (f.tipo === "combo" ? suma : suma + valor(f)), 0);
}

/**
 * La suma de una cifra del inventario (5 nov 2026, pedido de Hernán, para cuadrar el levantamiento). Sin los compuestos: su stock no existe aparte, es cuántos se
 * pueden armar con sus componentes (`wms_stock_resumen`), así que sumarlos contaría dos veces las mismas unidades.
 */
export function sumaSinCompuestos<F extends { tipo: string }>(filas: F[], valor: (f: F) => number): number {
  return filas.reduce((suma, f) => (f.tipo === "combo" ? suma : suma + valor(f)), 0);
}

/**
 * Si un producto tiene stock (7 nov 2026, pedido de Hernán): lo que hay en las plataformas (Dropi, Effi, Drop) también es stock, en todos los países. Negativo es solo el
 * físico de las bodegas, que es lo que se corrige aquí.
 */
export function existencia(fisico: number, enPlataformas = 0): "negativo" | "sin_stock" | "con_stock" {
  if (fisico < 0) return "negativo";
  return fisico > 0 || enPlataformas > 0 ? "con_stock" : "sin_stock";
}

/**
 * Lo que pide atención va primero: los saldos negativos, luego lo que tiene stock y al final lo que está en cero, sin cambiar el orden dentro de cada parte.
 * `fuera` son las unidades que tiene en otra parte (en las plataformas): con ellas un producto no cuenta como en cero.
 */
export function conStockPrimero<F extends { fisico: number }>(filas: F[], fuera: (f: F) => number = () => 0): F[] {
  const orden = { negativo: 0, con_stock: 1, sin_stock: 2 };
  const lugar = (f: F) => orden[existencia(f.fisico, fuera(f))];
  return [...filas].sort((a, b) => lugar(a) - lugar(b));
}

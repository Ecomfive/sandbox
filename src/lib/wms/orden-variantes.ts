// El orden en que se ven las variantes de un producto (13 nov 2026, pedido de Jhokser): por defecto el de siempre (por SKU, ascendente) y, con el botón de la lista, al revés.
// Una sola elección para Stock, Levantamiento y la ficha de Producto.

/** Las variantes en el orden elegido; la lista de entrada no se cambia. */
export function ordenarVariantes<T>(lista: readonly T[], descendente: boolean): T[] {
  return descendente ? [...lista].reverse() : [...lista];
}

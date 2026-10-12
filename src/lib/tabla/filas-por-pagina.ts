// Cuántas filas se ven por página en las tablas: lo elige cada persona (50, 100, 500 o todas) y vale para todas las tablas.
// Sin React, para poder probarlo.

/** Lo que se guarda: una de las cantidades de la lista o «todas». */
export type FilasPorPagina = number | "todas";

/** La cantidad más chica de la lista: con menos filas que esta no hay nada que elegir. */
export const MINIMO_FILAS_POR_PAGINA = 50;

export const OPCIONES_FILAS_POR_PAGINA: readonly FilasPorPagina[] = [50, 100, 500, "todas"];

/** Con «todas» la tabla se pagina con un tamaño que ninguna lista alcanza: una sola página. */
export const TAMANO_TODAS = 1_000_000;

/** Lo guardado en el navegador, ya validado: algo que no sea de la lista se descarta (se usa lo de cada tabla). */
export function leerFilasPorPagina(guardado: string | null | undefined): FilasPorPagina | null {
  if (guardado === "todas") return "todas";
  const n = Number(guardado);
  return OPCIONES_FILAS_POR_PAGINA.includes(n) ? n : null;
}

/** El tamaño de página que se usa: lo elegido por la persona o, si no eligió, el de la tabla. */
export function tamanoDePagina(elegido: FilasPorPagina | null, porDefecto: number): number {
  if (elegido === null) return porDefecto;
  return elegido === "todas" ? TAMANO_TODAS : elegido;
}

/** Lo que muestra el selector, dado el tamaño que se está usando (una tabla cuyo valor no está en la lista no marca ninguna). */
export function opcionMarcada(tamano: number): FilasPorPagina | null {
  if (tamano >= TAMANO_TODAS) return "todas";
  return OPCIONES_FILAS_POR_PAGINA.includes(tamano) ? tamano : null;
}

export const etiquetaFilasPorPagina = (o: FilasPorPagina) => (o === "todas" ? "Todas" : String(o));

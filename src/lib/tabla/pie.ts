export interface NombreFilas {
  singular: string;
  plural: string;
}

const conNumero = (n: number, nombre: NombreFilas) => `${n} ${n === 1 ? nombre.singular : nombre.plural}`;

/**
 * Notas del pie de la tabla: cuántas filas se ven de cuántas (con filtros), cuántos grupos (al agrupar), o
 * que solo se muestran las más recientes; y cuántas filas "cerradas" quedan sin mostrar.
 */
export function notasPie({
  hayFiltros,
  agrupado,
  visibles,
  base,
  grupos,
  limiteSinFiltros,
  nombre,
  cerradosVisibles,
  cerradosOcultos,
  etiquetaCerrados,
}: {
  hayFiltros: boolean;
  agrupado: boolean;
  visibles: number;
  base: number;
  grupos: number;
  /** Tope de filas cuando no hay filtros ni grupos; sin él se muestran todas. */
  limiteSinFiltros?: number;
  nombre: NombreFilas;
  cerradosVisibles: boolean;
  cerradosOcultos: number;
  etiquetaCerrados?: string;
}): string[] {
  const notas: string[] = [];
  if (hayFiltros) notas.push(`${visibles} de ${base} ${nombre.plural}`);
  else if (agrupado) notas.push(`${conNumero(visibles, nombre)} en ${grupos} ${grupos === 1 ? "grupo" : "grupos"}`);
  else if (limiteSinFiltros !== undefined && base > limiteSinFiltros) {
    notas.push(`Mostrando los ${limiteSinFiltros} más recientes de ${base}. Usa los filtros para ver el resto.`);
  }
  if (!cerradosVisibles && cerradosOcultos > 0 && etiquetaCerrados) {
    notas.push(`${cerradosOcultos} ${cerradosOcultos === 1 ? etiquetaCerrados.replace(/s$/, "") : etiquetaCerrados} sin mostrar`.toLowerCase());
  }
  return notas;
}

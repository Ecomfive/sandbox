/** Supabase limita cada respuesta a ~1000 filas; esto pagina con .range() hasta traerlas todas. */
export async function traerTodasLasFilas<T>(
  construirConsulta: (rangoDesde: number, rangoHasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const TAMANO_PAGINA = 1000;
  const filas: T[] = [];
  let rangoDesde = 0;
  for (;;) {
    const { data, error } = await construirConsulta(rangoDesde, rangoDesde + TAMANO_PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < TAMANO_PAGINA) break;
    rangoDesde += TAMANO_PAGINA;
  }
  return filas;
}

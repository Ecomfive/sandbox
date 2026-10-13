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

/**
 * Lo mismo que `traerTodasLasFilas`, pero con la forma `{ data, error }` de una consulta de Supabase: no lanza, así que sirve donde
 * el código ya mira `error` (por ejemplo, una columna que puede no existir todavía).
 */
export async function traerTodasConError<T>(
  construirConsulta: (rangoDesde: number, rangoHasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[] | null; error: unknown }> {
  try {
    return { data: await traerTodasLasFilas<T>(construirConsulta), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

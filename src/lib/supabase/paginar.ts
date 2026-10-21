/** Supabase limita cada respuesta a ~1000 filas; esto pagina con .range() hasta traerlas todas. */
const TAMANO_PAGINA = 1000;
/** Después de la primera, las páginas se piden de a tantas a la vez: con 11 600 eventos de compras, de 12 viajes seguidos a 3. */
const EN_PARALELO = 4;

export async function traerTodasLasFilas<T>(
  construirConsulta: (rangoDesde: number, rangoHasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const pagina = async (n: number) => {
    const { data, error } = await construirConsulta(n * TAMANO_PAGINA, (n + 1) * TAMANO_PAGINA - 1);
    if (error) throw error;
    return data ?? [];
  };
  // La primera sola: casi todas las tablas caben en una página y así no se piden páginas vacías de más.
  const filas: T[] = await pagina(0);
  if (filas.length < TAMANO_PAGINA) return filas;
  for (let siguiente = 1; ; siguiente += EN_PARALELO) {
    const tanda = await Promise.all(Array.from({ length: EN_PARALELO }, (_, i) => pagina(siguiente + i)));
    for (const datos of tanda) {
      filas.push(...datos);
      // Una página incompleta es la última: las que siguen vienen vacías.
      if (datos.length < TAMANO_PAGINA) return filas;
    }
  }
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

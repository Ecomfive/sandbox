// El correlativo (#0007) se asigna al CREAR el retiro. La ficha de crear solo muestra cuál sería
// el siguiente; si otra persona crea un retiro primero y ese número se ocupa, se guarda con el
// siguiente libre y la ficha del retiro avisa del cambio (el número se escribe en Dropi).

export interface ErrorBd {
  code?: string;
  message?: string;
  details?: string;
}

export interface ResultadoInsercion<T> {
  data: T | null;
  error: ErrorBd | null;
}

export const MAX_INTENTOS_CORRELATIVO = 5;

/** ¿El insert falló porque ese número de correlativo ya lo tiene otro retiro? */
export function esConflictoDeCorrelativo(error: ErrorBd | null | undefined): boolean {
  if (!error || error.code !== "23505") return false;
  return /correlativo/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

/**
 * Inserta con el número que vio la persona al abrir la ficha (`pedido`). Si ese número ya lo tomó
 * otro retiro, reintenta con el siguiente libre. `siguiente` puede devolver null (no se pudo
 * consultar): entonces se inserta sin número y lo pone la base de datos.
 */
export async function insertarConCorrelativo<T>(
  insertar: (numero: number | null) => Promise<ResultadoInsercion<T>>,
  siguiente: () => Promise<number | null>,
  pedido: number | null
): Promise<ResultadoInsercion<T> & { intentos: number }> {
  let numero = pedido;
  let ultimo: ResultadoInsercion<T> = { data: null, error: null };
  for (let intento = 1; intento <= MAX_INTENTOS_CORRELATIVO; intento++) {
    ultimo = await insertar(numero);
    if (!esConflictoDeCorrelativo(ultimo.error)) return { ...ultimo, intentos: intento };
    numero = await siguiente();
  }
  return { ...ultimo, intentos: MAX_INTENTOS_CORRELATIVO };
}

/** "8" -> 8; cualquier otra cosa (vacío, negativo, letras) -> null. */
export function leerCorrelativo(texto: string | null | undefined): number | null {
  if (!texto || !/^\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero >= 1 ? numero : null;
}

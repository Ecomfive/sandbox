/**
 * Cuánto avanzar una barra de progreso de un proceso de duración incierta (leer una página pública, guardar una lectura) para que se sienta
 * rápido: arranca de golpe (la mitad del camino en el primer cuarto del tiempo esperado), luego frena y nunca llega al final hasta que el
 * proceso termina. Si tarda más de lo esperado sigue avanzando muy despacio, así que nunca parece trabada.
 */
export const TOPE_ESTIMADO = 0.92;

/** La fracción (0 a `TOPE_ESTIMADO`) que corresponde a `ms` milisegundos de un proceso que suele durar `estimadoMs`. */
export function fraccionEstimada(ms: number, estimadoMs: number): number {
  if (!(ms > 0) || !(estimadoMs > 0)) return 0;
  return Math.min(TOPE_ESTIMADO, TOPE_ESTIMADO * (1 - Math.exp((-3 * ms) / estimadoMs)));
}

/** El paso (desde 0) que toca mostrar para esa fracción: los primeros pasan rápido y el último dura lo que falte. */
export function pasoActual(fraccion: number, pasos: number): number {
  if (pasos <= 1) return 0;
  return Math.max(0, Math.min(pasos - 1, Math.floor((fraccion / TOPE_ESTIMADO) * pasos)));
}

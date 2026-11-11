// Piezas comunes de las cargas por lotes de los importadores.

/** Avisa cuánto va cargado (`hechos` de `total`, en la unidad del importador: movimientos, líneas, órdenes…). */
export type Avance = (hechos: number, total: number, mensaje?: string) => void;

/** El aviso cuando falla un lote a mitad de la carga: lo ya cargado no se duplica al reintentar (upsert por huella). */
export const mensajeLoteFallido = (hechos: number, total: number, error: string) =>
  `Se cargaron ${hechos} de ${total} y falló un lote: ${error}. Puedes volver a intentarlo: lo ya cargado no se duplica.`;

/** Una acción del servidor que se cortó (red, despliegue) se vuelve un `{ error }` como las demás. */
export const cortada = () => ({ error: "se cortó la conexión" }) as const;

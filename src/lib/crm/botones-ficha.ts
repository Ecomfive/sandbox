/**
 * El orden de los botones de la ficha del dropshipper y del chat (30 oct 2026, pedido de Jhokser): los más usados quedan **a la derecha** y los demás van
 * hacia la izquierda según cuánto se usan. Lógica pura: cada persona cuenta sus pulsaciones en su navegador (`botones-ficha.tsx`).
 */

/**
 * Todos los botones que puede haber, en su orden de siempre (el primero queda a la derecha mientras nadie haya usado ninguno). Un botón nuevo se agrega aquí.
 */
export const BOTONES_FICHA = [
  "whatsapp",
  "tomar",
  "resuelta",
  "tarea",
  "caso",
  "recomendar",
  "no_leido",
  "pasar_comercial",
  "pasar_direccion",
  "pasar_atencion",
  "importar",
  "borrado_app",
  "pedir_borrar",
  "vincular",
] as const;

export type BotonFicha = (typeof BOTONES_FICHA)[number];

/** Cuántas veces se usó cada botón (por su id). */
export type UsosBotones = Record<string, number>;

/**
 * La posición de cada botón, de 0 (el de más a la derecha) hacia la izquierda: del más usado al menos usado y, a igual uso, el de siempre. Los ids que no
 * se conocen se ignoran y los usos raros (negativos, no numéricos) cuentan como cero.
 */
export function ordenDeBotones(usos: UsosBotones, ids: readonly string[] = BOTONES_FICHA): Map<string, number> {
  const uso = (id: string) => {
    const n = usos[id];
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  };
  const ordenados = ids.map((id, i) => ({ id, i })).sort((a, b) => uso(b.id) - uso(a.id) || a.i - b.i);
  return new Map(ordenados.map((x, posicion) => [x.id, posicion]));
}

/** Lo guardado en el navegador → los usos (cualquier cosa que no sea el objeto esperado queda en cero usos). */
export function leerUsos(texto: string | null): UsosBotones {
  if (!texto) return {};
  try {
    const crudo = JSON.parse(texto) as unknown;
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const usos: UsosBotones = {};
    for (const [id, n] of Object.entries(crudo as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n) && n > 0) usos[id] = Math.min(Math.floor(n), 100_000);
    return usos;
  } catch {
    return {};
  }
}

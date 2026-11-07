/**
 * Corregir el físico de un producto en una bodega escribiendo el valor correcto (pedido de Hernán, 7 nov 2026): el sistema calcula la diferencia y la guarda como un ajuste, con la
 * nota de por qué, en todos los países. Lógica pura, con prueba.
 */

/** Lo más largo que puede ser la nota. */
export const MAX_NOTA_CORRECCION = 400;
const MAX_CANTIDAD = 1_000_000;

/** Revisa una corrección: el valor que se vio, el correcto y la nota. Devuelve la diferencia y el motivo para el ajuste, o el primer error en palabras. */
export function revisarCorreccionStock(entrada: { actual: number; correcto: unknown; nota: unknown }): { diferencia: number; motivo: string } | { error: string } {
  const texto = typeof entrada.correcto === "string" ? entrada.correcto.trim() : entrada.correcto;
  const correcto = texto === "" || texto === null || texto === undefined ? NaN : Number(texto);
  if (!Number.isInteger(correcto) || correcto < 0 || correcto > MAX_CANTIDAD) return { error: "Escribe la cantidad correcta: un número entero, 0 o más." };
  const nota = typeof entrada.nota === "string" ? entrada.nota.trim().slice(0, MAX_NOTA_CORRECCION) : "";
  if (nota.length < 3) return { error: "Escribe por qué lo corriges." };
  const diferencia = correcto - entrada.actual;
  if (diferencia === 0) return { error: "Es el mismo valor que ya tiene: no hay nada que corregir." };
  return { diferencia, motivo: `Corrección ${entrada.actual.toLocaleString("es-PA")} → ${correcto.toLocaleString("es-PA")}: ${nota}` };
}

/** «Se suman 3 unidades» o «Se restan 8 unidades», para que se vea antes de guardar. */
export function textoDiferencia(diferencia: number): string {
  const n = Math.abs(diferencia);
  return `Se ${diferencia > 0 ? "suman" : "restan"} ${n.toLocaleString("es-PA")} ${n === 1 ? "unidad" : "unidades"}`;
}

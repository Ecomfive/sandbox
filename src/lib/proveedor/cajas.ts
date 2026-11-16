// Portal del proveedor: las cajas («Cartons») de un envío. Lógica pura.

/** Cuántas cajas se aceptan en un envío (atajar un cero de más). */
export const MAX_CAJAS = 9999;

/** Las cajas que manda el proveedor: un número entero de 1 a `MAX_CAJAS`. Devuelve el error como texto. */
export function validarCajas(valor: unknown): { cajas: number } | { error: string } {
  if (valor === null || valor === undefined || String(valor).trim() === "") return { error: "Escribe cuántas cajas lleva el envío." };
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(/,/g, "").trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_CAJAS) return { error: "Las cajas deben ser un número entero mayor que cero." };
  return { cajas: n };
}

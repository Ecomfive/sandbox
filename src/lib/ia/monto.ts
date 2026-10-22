/** Lee un monto en dólares («12», «12,50», «$12.5»): de 0 a 100 000 y con hasta dos decimales. null si no es un monto. */
export function leerMonto(texto: unknown): number | null {
  const limpio = String(texto ?? "").trim().replace(/^\$/, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 0 && n <= 100000 ? n : null;
}

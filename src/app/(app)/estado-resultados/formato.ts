// Formato de montos del Estado de resultados y de las páginas que lo importan. Delega en el formato único del Portal AF4
// (`src/lib/af4/formato.ts`: signo menos tipográfico, locale por moneda); se conserva para no romper a quien lo usa.
// Código nuevo: importar `dinero`, `dineroCompacto` y `porcentaje` de `@/lib/af4/formato`.

import { dinero, dineroCompacto, porcentaje } from "@/lib/af4/formato";

export function formatoDinero(valor: number, moneda: string): string {
  return dinero(valor, moneda);
}

/** Igual, abreviado para los ejes de la gráfica: «$12.3 K», «₡3,4 M». */
export function formatoDineroCorto(valor: number, moneda: string): string {
  return dineroCompacto(valor, moneda);
}

export function formatoPct(valor: number | null): string {
  return porcentaje(valor);
}

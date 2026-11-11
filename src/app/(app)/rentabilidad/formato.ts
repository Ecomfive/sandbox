// Formato de Rentabilidad (todo en dólares). Delega en el formato único del Portal AF4 (`src/lib/af4/formato.ts`).

import { dias as diasAF4, numero as numeroAF4, porcentaje } from "@/lib/af4/formato";
import type { Fuente } from "@/lib/finanzas/rentabilidad";

export const ETIQUETA_FUENTE: Record<Fuente, string> = {
  ventas: "ventas",
  libro: "libro",
  mixta: "ventas y libro",
  sin_datos: "sin datos",
};

/** Un porcentaje ya multiplicado por 100 («28.4 %»); null → «—». */
export const pct1 = (v: number | null) => porcentaje(v);

/** Días («42 días»); null → «—». */
export const dias = (v: number | null) => diasAF4(v);

/** Un número con hasta un decimal. */
export const numero = (v: number | null, decimales = 0) => numeroAF4(v, decimales);

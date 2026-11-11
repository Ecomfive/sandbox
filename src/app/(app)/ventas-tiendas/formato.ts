// Formato de Ventas por tienda (todo en dólares). Delega en el formato único del Portal AF4 (`src/lib/af4/formato.ts`);
// se conserva para no romper a quien lo usa. Código nuevo: importar de `@/lib/af4/formato`.

import { dinero, dineroCompacto, entero as enteroAF4, fraccion } from "@/lib/af4/formato";

export const usd = (v: number) => dinero(v, "USD");

export const usd2 = (v: number) => dinero(v, "USD", { decimales: 2 });

export const usdCorto = (v: number) => dineroCompacto(v, "USD");

export const entero = (v: number) => enteroAF4(v);

/** Una fracción (0,873) como porcentaje («87.3 %»); null → «—». */
export const pct = (v: number | null) => fraccion(v);

/** Debajo de esta cobertura de costo el margen bruto se marca con un punto ámbar. */
export const COBERTURA_MINIMA = 0.8;

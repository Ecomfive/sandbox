// Adaptador de las filas «por mes» que arman los módulos para la vieja `TablaMensual` (utilidades, flujo) al modelo de
// la tabla financiera AF4. Lógica pura (con prueba en `tabla-mensual.test.ts`).

import type { FilaAF4, TipoFilaAF4 } from "./tabla-financiera";

/** La forma de una fila de `TablaMensual` (src/components/finanzas/tabla-mensual.tsx) y de `filasPorSocio`/`filasPorTienda`. */
export interface FilaMensualEntrada {
  clave: string;
  etiqueta: string;
  tipo: "grupo" | "seccion" | "detalle" | "resultado";
  valores: Record<string, number>;
  /** undefined = la suma de los meses; null = vacía (un saldo). */
  total?: number | null;
}

export interface OpcionesTablaMensual {
  /**
   * Cómo se dibuja una fila «grupo» seguida de su detalle: `grupo` (encabezado de bloque, se despliega solo con «Ver
   * detalle») o `seccion` (cada una con su flecha para desplegar su detalle, como un socio o una tienda).
   */
  grupos?: "grupo" | "seccion";
}

/**
 * - grupo → grupo (o sección, con `grupos: "seccion"`), con su total;
 * - seccion → seccion;
 * - detalle → detalle de la última fila grupo o sección que lo precede (se despliega con ella);
 * - resultado → saldo si su total está vacío (no se suma), si no subtotal.
 */
export function desdeTablaMensual(filas: FilaMensualEntrada[], meses: string[], opciones: OpcionesTablaMensual = {}): FilaAF4[] {
  const { grupos = "grupo" } = opciones;
  let padre: string | undefined;
  return filas.map((f) => {
    const valores = meses.map((m) => f.valores[m] ?? 0);
    const base = { clave: f.clave, etiqueta: f.etiqueta, valores, ...(f.total === undefined ? {} : { total: f.total }) };
    if (f.tipo === "detalle") return { ...base, tipo: "detalle", padre };
    if (f.tipo === "resultado") {
      padre = undefined;
      const tipo: TipoFilaAF4 = f.total === null ? "saldo" : "subtotal";
      return { ...base, tipo };
    }
    padre = f.clave;
    const tipo: TipoFilaAF4 = f.tipo === "grupo" ? grupos : "seccion";
    return { ...base, tipo };
  });
}

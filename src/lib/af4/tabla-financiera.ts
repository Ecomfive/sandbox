// El modelo de la tabla financiera del Portal AF4 360° (estado de resultados, cascada, flujo, presupuesto, proyección):
// filas de grupo, sección, detalle, subtotal, total, porcentaje y saldo; columnas de período y un total. Lógica pura:
// la dibuja `<TablaFinanciera>` (src/components/af4/tabla-financiera.tsx). Aquí viven también los adaptadores desde las
// filas que ya arman el EERR y la proyección, para que la tabla no conozca cada módulo.

import type { Fila as FilaEerr } from "@/lib/finanzas/eerr-filas";
import type { FilaTabla as FilaProyeccion } from "@/lib/finanzas/proyeccion-caja";

/**
 * - grupo: encabezado de un bloque grande (Entradas, Salidas), con su suma.
 * - seccion: un rubro con su total (Costo de ventas) que puede desplegar su detalle.
 * - detalle: una línea dentro de una sección (sangrada, gris).
 * - subtotal: un resultado intermedio (Margen bruto, EBITDA).
 * - total: el resultado final (Resultado neto, Caja final).
 * - porcentaje: un margen sobre ventas (Margen EBITDA %), en itálica gris.
 * - saldo: un saldo de apertura o cierre (no se suma en la columna Total).
 */
export type TipoFilaAF4 = "grupo" | "seccion" | "detalle" | "subtotal" | "total" | "porcentaje" | "saldo";

export interface FilaAF4 {
  clave: string;
  etiqueta: string;
  tipo: TipoFilaAF4;
  /** Un valor por columna (null = vacío). Los porcentajes ya vienen en escala 0–100. */
  valores: (number | null)[];
  /** La columna Total; undefined = la suma de los valores; null = vacía (un saldo). */
  total?: number | null;
  /** La sección que la contiene (para desplegar el detalle). */
  padre?: string;
  /** Para el % sobre ventas de esta fila: la base de cada columna (ingresos). */
  base?: (number | null)[];
  /** Resalta su negativo en rojo aunque no sea un resultado (el saldo de una cuenta que se despliega como sección). */
  resaltarNegativo?: boolean;
}

export interface ColumnaAF4 {
  clave: string;
  etiqueta: string;
  /** Segunda línea del encabezado («14 sep»). */
  detalle?: string;
  /** Un punto de color en el encabezado (semana bajo la caja mínima) y su explicación para lectores de pantalla. */
  marca?: { tono: "destructive" | "warning"; texto: string };
}

/** El total de una fila: el que trae, o la suma de sus valores (nulos fuera). Un saldo no se suma. */
export function totalFila(f: FilaAF4): number | null {
  if (f.total !== undefined) return f.total;
  if (f.tipo === "saldo" || f.tipo === "porcentaje") return null;
  return f.valores.reduce<number>((a, v) => a + (v ?? 0), 0);
}

/** Las secciones que tienen detalle (las que se pueden desplegar). */
export function seccionesConDetalle(filas: FilaAF4[]): string[] {
  return [...new Set(filas.filter((f) => f.padre).map((f) => f.padre!))];
}

/** Las filas que se ven con estas secciones abiertas (el detalle de una cerrada no se dibuja). */
export function filasVisibles(filas: FilaAF4[], abiertas: ReadonlySet<string>): FilaAF4[] {
  return filas.filter((f) => !f.padre || abiertas.has(f.padre));
}

/** % de un valor sobre su base (ventas); null si la base no es positiva. */
export function sobreBase(valor: number | null, base: number | null | undefined): number | null {
  if (valor === null || base === null || base === undefined || base <= 0) return null;
  return (valor / base) * 100;
}

/** Si una fila resalta su negativo en rojo: solo los resultados (un detalle negativo es un reverso, no una alarma). */
export const marcaNegativo = (f: FilaAF4): boolean =>
  f.resaltarNegativo ?? (f.tipo === "subtotal" || f.tipo === "total" || f.tipo === "saldo");

// ---------------------------------------------------------------------------------------------
// Adaptadores
// ---------------------------------------------------------------------------------------------

/**
 * Las filas del Estado de resultados (`filasEstado`) en el modelo AF4. Los totales de las secciones se calculan igual
 * que antes; el detalle queda debajo de su sección para poder plegarlo; los márgenes % traen su base.
 */
export function desdeEerr(filas: FilaEerr[], meses: string[]): FilaAF4[] {
  let seccion: string | undefined;
  return filas.map((f) => {
    const valores = meses.map((m) => f.valores[m] ?? 0);
    if (f.tipo === "seccion") {
      seccion = f.clave;
      return { clave: f.clave, etiqueta: f.etiqueta, tipo: "seccion", valores };
    }
    if (f.tipo === "detalle") return { clave: f.clave, etiqueta: f.etiqueta, tipo: "detalle", valores, padre: seccion };
    if (f.tipo === "porcentaje") {
      const base = meses.map((m) => f.base?.[m] ?? 0);
      const sumaV = valores.reduce((a, v) => a + v, 0);
      const sumaB = base.reduce((a, v) => a + v, 0);
      return {
        clave: f.clave,
        etiqueta: f.etiqueta,
        tipo: "porcentaje",
        valores: valores.map((v, i) => sobreBase(v, base[i])),
        total: sobreBase(sumaV, sumaB),
      };
    }
    // Resultado: el último (Resultado neto) es el total; los intermedios, subtotales.
    return { clave: f.clave, etiqueta: f.etiqueta, tipo: f.clave === "resultado-neto" ? "total" : "subtotal", valores };
  });
}

/** Las filas de la proyección semanal en el modelo AF4 (conceptos con detalle desplegable). */
export function desdeProyeccion(filas: FilaProyeccion[]): FilaAF4[] {
  return filas.map((f) => {
    const base = { clave: f.clave, etiqueta: f.etiqueta, valores: f.valores, total: f.total };
    if (f.tipo === "grupo") return { ...base, tipo: "grupo" };
    if (f.tipo === "detalle") return { ...base, tipo: "detalle", padre: f.padre };
    if (f.tipo === "concepto") return { ...base, tipo: "seccion" };
    // Resultados: la caja al comenzar y la final son saldos; el neto, un subtotal.
    return { ...base, tipo: f.clave === "neto" ? "subtotal" : f.clave === "caja-final" ? "total" : "saldo" };
  });
}

/** Una fila de un estado por mes armado con `TablaMensual` (flujo de caja, utilidades): `valores` por mes «AAAA-MM-01». */
export interface FilaMensualAF4 {
  clave: string;
  etiqueta: string;
  tipo: "grupo" | "seccion" | "detalle" | "resultado";
  valores: Record<string, number>;
  total?: number | null;
}

export interface OpcionesTablaMensual {
  /** Las claves de los resultados que son saldos (caja inicial): no se suman en la columna Total. */
  saldos?: string[];
  /** La clave del resultado final (caja final): doble filete. */
  totalFinal?: string;
  /** Un grupo con detalle debajo (una cuenta) se dibuja como sección plegable con su negativo en rojo. */
  gruposPlegables?: boolean;
}

/**
 * Las filas de `TablaMensual` en el modelo AF4: una sección (o un grupo plegable) se vuelve el padre de los detalles que
 * le siguen; un resultado corta esa relación (un detalle después de un resultado, como la diferencia de cambio, queda
 * siempre a la vista). Un resultado es saldo, total final o subtotal según `opciones`.
 */
export function desdeTablaMensual(filas: FilaMensualAF4[], meses: string[], opciones: OpcionesTablaMensual = {}): FilaAF4[] {
  const { saldos = [], totalFinal, gruposPlegables = false } = opciones;
  let padre: string | undefined;
  return filas.map((f) => {
    const valores = meses.map((m) => f.valores[m] ?? 0);
    const base = { clave: f.clave, etiqueta: f.etiqueta, valores, ...(f.total !== undefined ? { total: f.total } : {}) };
    if (f.tipo === "seccion") {
      padre = f.clave;
      return { ...base, tipo: "seccion" as const };
    }
    if (f.tipo === "grupo") {
      padre = gruposPlegables ? f.clave : undefined;
      return gruposPlegables ? { ...base, tipo: "seccion" as const, resaltarNegativo: true } : { ...base, tipo: "grupo" as const };
    }
    if (f.tipo === "detalle") return { ...base, tipo: "detalle" as const, ...(padre ? { padre } : {}) };
    padre = undefined;
    const tipo: TipoFilaAF4 = saldos.includes(f.clave) ? "saldo" : f.clave === totalFinal ? "total" : "subtotal";
    return { ...base, tipo };
  });
}

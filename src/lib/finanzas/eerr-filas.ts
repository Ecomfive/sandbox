// Las filas del Estado de resultados tal como se muestran (secciones, tipos con movimiento y resultados intermedios).
// Las usan la tabla de la página y la descarga en Excel, para que digan exactamente lo mismo.

import type { Eerr, PorMes, Seccion } from "./eerr";

export type TipoFila = "seccion" | "detalle" | "resultado" | "porcentaje";

export interface Fila {
  clave: string;
  etiqueta: string;
  tipo: TipoFila;
  valores: PorMes;
  /** Para los porcentajes: sobre qué se calcula (valor / ingresos). */
  base?: PorMes;
}

/** Después de qué sección va cada resultado intermedio, como en el EERR de Excel. */
const RESULTADOS: Partial<Record<Seccion, (e: Eerr) => Fila[]>> = {
  ingresos: (e) => [{ clave: "ingresos-netos", etiqueta: "Ingresos netos", tipo: "resultado", valores: e.ingresosNetos }],
  costo_ventas: (e) => [
    { clave: "margen-bruto", etiqueta: "Margen bruto", tipo: "resultado", valores: e.margenBruto },
    { clave: "margen-bruto-pct", etiqueta: "Margen bruto %", tipo: "porcentaje", valores: e.margenBruto, base: e.ingresosNetos },
  ],
  marketing: (e) => [
    { clave: "ebitda", etiqueta: "EBITDA", tipo: "resultado", valores: e.ebitda },
    { clave: "ebitda-pct", etiqueta: "Margen EBITDA %", tipo: "porcentaje", valores: e.ebitda, base: e.ingresosNetos },
  ],
  // Solo cuando la depreciación entra al EERR (si no, el EBIT es el mismo EBITDA).
  depreciacion: (e) =>
    e.secciones.some((s) => s.seccion === "depreciacion" && s.tipos.some((t) => t.total !== 0))
      ? [{ clave: "ebit", etiqueta: "Resultado operativo (EBIT)", tipo: "resultado", valores: e.ebit }]
      : [],
  impuesto_ganancias: (e) => [
    { clave: "resultado-neto", etiqueta: "Resultado neto", tipo: "resultado", valores: e.resultadoNeto },
    { clave: "resultado-neto-pct", etiqueta: "Margen neto %", tipo: "porcentaje", valores: e.resultadoNeto, base: e.ingresosNetos },
  ],
};

/** Las filas del estado: cada sección con su total, sus tipos con movimiento y los resultados intermedios. */
export function filasEstado(eerr: Eerr): Fila[] {
  const filas: Fila[] = [];
  for (const s of eerr.secciones) {
    const conMovimiento = s.tipos.filter((t) => t.total !== 0);
    if (conMovimiento.length) {
      // El total de una sección de costos se muestra en positivo (lo que se gastó); el de ingresos, neto.
      const valores = Object.fromEntries(eerr.meses.map((m) => [m, s.seccion === "ingresos" ? s.efecto[m] : -s.efecto[m]]));
      filas.push({ clave: s.seccion, etiqueta: s.etiqueta, tipo: "seccion", valores });
      for (const t of conMovimiento) {
        // Dentro de ingresos, la devolución resta: se ve con su signo.
        const signo = s.seccion === "ingresos" ? t.signo : 1;
        filas.push({
          clave: `${s.seccion}-${t.tipo}`,
          etiqueta: t.tipo,
          tipo: "detalle",
          valores: Object.fromEntries(eerr.meses.map((m) => [m, t.meses[m] * signo])),
        });
      }
    }
    filas.push(...(RESULTADOS[s.seccion]?.(eerr) ?? []));
  }
  return filas;
}


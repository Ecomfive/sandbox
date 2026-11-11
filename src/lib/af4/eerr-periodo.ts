// El Estado de resultados de un período elegido (`?periodo=`), con el período anterior comparable para las variaciones.
// Lo comparten la página y su descarga en Excel, para que digan exactamente lo mismo.

import { armarEerr, total, type Eerr, type FilaEerr } from "@/lib/finanzas/eerr";
import { elegirPeriodoAF4, opcionesPeriodo, periodoAnterior, type OpcionesPeriodo, type PeriodoAF4 } from "./periodo";

/** Los meses que se leen de la base: dos años, para poder elegir hasta 12 meses y compararlos con los 12 anteriores. */
export const VENTANA_EERR = 24;

/** El EERR arranca en los últimos 12 meses e incluye el mes en curso (como siempre lo mostró). */
export const PERIODO_EERR: OpcionesPeriodo = { predeterminado: "u12", ultimos: [3, 6, 12], incluirEnCurso: true, conAnio: true };

export interface EerrDelPeriodo {
  periodo: PeriodoAF4;
  eerr: Eerr;
  /** El mismo largo justo antes, si hay datos suficientes. */
  anterior: Eerr | null;
  opciones: ReturnType<typeof opcionesPeriodo>;
}

export function eerrDelPeriodo(filas: FilaEerr[], conDatos: Iterable<string>, param: unknown, mesEnCurso: string): EerrDelPeriodo {
  const meses = [...new Set(conDatos)].sort();
  const periodo = elegirPeriodoAF4(param, meses, mesEnCurso, PERIODO_EERR);
  const previos = periodoAnterior(periodo, meses);
  const anterior = previos.length === periodo.meses.length && previos.length > 0 ? armarEerr(filas, previos) : null;
  return {
    periodo,
    eerr: armarEerr(filas, periodo.meses),
    anterior,
    opciones: opcionesPeriodo(meses, mesEnCurso, { ...PERIODO_EERR, maxMeses: 24 }),
  };
}

/** Los totales que muestran los KPIs del EERR. */
export function totalesEerr(e: Eerr) {
  const ingresos = total(e.ingresosNetos);
  return {
    ingresos,
    margenBruto: total(e.margenBruto),
    ebitda: total(e.ebitda),
    resultadoNeto: total(e.resultadoNeto),
    dividendos: total(e.dividendos),
  };
}

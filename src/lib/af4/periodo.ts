// El período de una página financiera (`?periodo=`), en un solo patrón para todo el Portal AF4 360°:
//  - «u3», «u6», «u12»: los últimos N meses con datos;
//  - «aAAAA»: el año a la fecha (enero hasta el último mes con datos de ese año);
//  - «AAAA-MM» (o «AAAA-MM-01»): un solo mes.
// Generaliza `elegirPeriodo` de Rentabilidad (que sigue funcionando: «u3», «u12» y un mes son las mismas claves).

import { leerPeriodo, mesCorto, mesMedio, rangoMeses } from "./fecha";

export interface PeriodoAF4 {
  clave: string;
  /** «Últimos 12 meses», «Año 2026», «Sep 2026». */
  etiqueta: string;
  /** Los meses que cubre, del más viejo al más nuevo. */
  meses: string[];
  tipo: "ultimos" | "anio" | "mes";
}

export interface OpcionesPeriodo {
  /** La clave cuando la dirección no trae una (o trae una que no existe). */
  predeterminado?: string;
  /** Los «últimos N» que se ofrecen. */
  ultimos?: number[];
  /** Si el mes en curso (sin cerrar) cuenta. Rentabilidad no lo cuenta; el Estado de resultados sí lo muestra. */
  incluirEnCurso?: boolean;
  /** Si se ofrece el año a la fecha. */
  conAnio?: boolean;
}

export interface OpcionPeriodo {
  valor: string;
  etiqueta: string;
}

const RE_ULTIMOS = /^u(\d{1,2})$/;
const RE_ANIO = /^a(\d{4})$/;

/** Los meses que pueden elegirse (con datos y, si no se incluye, sin el mes en curso), ordenados y sin repetir. */
export function mesesElegibles(conDatos: string[], mesEnCurso: string, incluirEnCurso = false): string[] {
  const ordenados = [...new Set(conDatos)].sort();
  const cerrados = incluirEnCurso ? ordenados.filter((m) => m <= mesEnCurso) : ordenados.filter((m) => m < mesEnCurso);
  // Si todavía no hay ningún mes cerrado, se usa lo que haya (mejor ver el mes en curso que nada).
  return cerrados.length ? cerrados : ordenados;
}

/** Interpreta `?periodo=` contra los meses con datos. */
export function elegirPeriodoAF4(
  param: unknown,
  conDatos: string[],
  mesEnCurso: string,
  opciones: OpcionesPeriodo = {},
): PeriodoAF4 {
  const { predeterminado = "u3", ultimos = [3, 6, 12], incluirEnCurso = false, conAnio = true } = opciones;
  const base = mesesElegibles(conDatos, mesEnCurso, incluirEnCurso);
  const todos = [...new Set(conDatos)].sort();

  const interpretar = (valor: unknown): PeriodoAF4 | null => {
    if (typeof valor !== "string") return null;
    const u = RE_ULTIMOS.exec(valor);
    if (u && ultimos.includes(Number(u[1]))) {
      const n = Number(u[1]);
      return { clave: valor, etiqueta: `Últimos ${n} meses`, meses: base.slice(-n), tipo: "ultimos" };
    }
    const a = RE_ANIO.exec(valor);
    if (a && conAnio) {
      const meses = base.filter((m) => m.startsWith(a[1]));
      if (meses.length) return { clave: valor, etiqueta: `Año ${a[1]}`, meses, tipo: "anio" };
      return null;
    }
    const mes = leerPeriodo(valor);
    if (mes && todos.includes(mes)) return { clave: mes.slice(0, 7), etiqueta: mesMedio(mes), meses: [mes], tipo: "mes" };
    return null;
  };

  return interpretar(param) ?? interpretar(predeterminado) ?? { clave: predeterminado, etiqueta: "Sin datos", meses: [], tipo: "ultimos" };
}

/** Los accesos rápidos (últimos N y año a la fecha) y los meses sueltos, del más nuevo al más viejo. */
export function opcionesPeriodo(
  conDatos: string[],
  mesEnCurso: string,
  opciones: OpcionesPeriodo & { maxMeses?: number } = {},
): { rapidos: OpcionPeriodo[]; meses: OpcionPeriodo[] } {
  const { ultimos = [3, 6, 12], incluirEnCurso = false, conAnio = true, maxMeses = 24 } = opciones;
  const base = mesesElegibles(conDatos, mesEnCurso, incluirEnCurso);
  const rapidos: OpcionPeriodo[] = ultimos.filter((n) => n <= Math.max(base.length, 1)).map((n) => ({ valor: `u${n}`, etiqueta: `${n} meses` }));
  const ultimoAnio = base.at(-1)?.slice(0, 4);
  if (conAnio && ultimoAnio) rapidos.push({ valor: `a${ultimoAnio}`, etiqueta: `Año ${ultimoAnio}` });
  const meses = [...new Set(conDatos)]
    .sort()
    .reverse()
    .slice(0, maxMeses)
    .map((m) => ({ valor: m.slice(0, 7), etiqueta: mesMedio(m) }));
  return { rapidos, meses };
}

/** El período anterior comparable (los N meses antes, o el mismo mes un mes antes), para variaciones. */
export function periodoAnterior(periodo: PeriodoAF4, conDatos: string[]): string[] {
  if (!periodo.meses.length) return [];
  const todos = [...new Set(conDatos)].sort();
  const primero = periodo.meses[0];
  const previos = todos.filter((m) => m < primero);
  return previos.slice(-periodo.meses.length);
}

/** Texto corto del rango que cubre un período («sep 25 – ago 26»). */
export const rangoPeriodo = (p: PeriodoAF4): string => (p.tipo === "mes" ? mesCorto(p.meses[0]) : rangoMeses(p.meses));

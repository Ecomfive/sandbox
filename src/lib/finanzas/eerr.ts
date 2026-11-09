// Portal AF4 360° › Estado de resultados por tienda. Lógica pura: arma el EERR a partir de las filas de la vista
// `fin_eerr_mensual` (migración 0901: libro de movimientos con A DISTRIBUIR repartido por envíos). Sirve en el servidor
// y en el cliente. Prueba en `eerr.test.ts`.

export type Seccion =
  | "ingresos"
  | "costo_ventas"
  | "administracion"
  | "marketing"
  | "depreciacion"
  | "finanzas"
  | "otros"
  | "impuesto_ganancias";

/** Las secciones en el orden del EERR de Excel, con su nombre. */
export const SECCIONES: { clave: Seccion; etiqueta: string }[] = [
  { clave: "ingresos", etiqueta: "Ingresos" },
  { clave: "costo_ventas", etiqueta: "Costo de ventas" },
  { clave: "administracion", etiqueta: "Administración / operación" },
  { clave: "marketing", etiqueta: "Marketing" },
  // La D de EBITDA: debajo del EBITDA. Solo tiene movimiento con el interruptor de Ajustes (migración 0917).
  { clave: "depreciacion", etiqueta: "Depreciación" },
  { clave: "finanzas", etiqueta: "Finanzas" },
  { clave: "otros", etiqueta: "Otros" },
  { clave: "impuesto_ganancias", etiqueta: "Impuesto a las ganancias" },
];

/** Una fila de la vista, ya con el nombre del tipo y el orden del catálogo. */
export interface FilaEerr {
  periodo: string;
  unidad_id: string;
  tipo: string;
  orden: number;
  seccion: Seccion;
  /** +1 suma al resultado, -1 resta. */
  signo: number;
  /** Positivo, como en el libro. */
  monto: number;
}

/** Valores por mes (clave AAAA-MM-01). */
export type PorMes = Record<string, number>;

export interface LineaTipo {
  tipo: string;
  signo: number;
  /** Montos positivos tal como en el libro; la devolución se muestra con su signo. */
  meses: PorMes;
  total: number;
}

export interface BloqueSeccion {
  seccion: Seccion;
  etiqueta: string;
  tipos: LineaTipo[];
  /** Efecto en el resultado (ingresos positivos, costos y gastos negativos). */
  efecto: PorMes;
  efectoTotal: number;
}

export interface Eerr {
  meses: string[];
  secciones: BloqueSeccion[];
  /** Ingresos menos devoluciones. */
  ingresosNetos: PorMes;
  /** Ingresos netos − costo de ventas. */
  margenBruto: PorMes;
  /** Margen bruto − administración − marketing: el resultado operativo, antes de finanzas, otros e impuestos. */
  ebitda: PorMes;
  /** EBITDA − depreciación (el resultado operativo). Igual al EBITDA mientras la depreciación no entra al EERR. */
  ebit: PorMes;
  /** Todo, como la fila «RESULTADO NETO» del Excel (incluye retiros de dividendos, que el Excel trata como gasto). */
  resultadoNeto: PorMes;
  /** Retiros de dividendos dentro de «Otros»: se muestran aparte porque no son un gasto del negocio. */
  dividendos: PorMes;
}

const suma = (o: PorMes) => Object.values(o).reduce((a, b) => a + b, 0);

/** Arma el EERR de las filas dadas (de una tienda o de varias: se suman) para los meses pedidos. */
export function armarEerr(filas: FilaEerr[], meses: string[]): Eerr {
  const cero = (): PorMes => Object.fromEntries(meses.map((m) => [m, 0]));
  const enVentana = new Set(meses);
  const porSeccion = new Map<Seccion, Map<string, LineaTipo & { orden: number }>>();
  for (const f of filas) {
    if (!enVentana.has(f.periodo)) continue;
    const tipos = porSeccion.get(f.seccion) ?? new Map();
    porSeccion.set(f.seccion, tipos);
    const linea = tipos.get(f.tipo) ?? { tipo: f.tipo, signo: f.signo, orden: f.orden, meses: cero(), total: 0 };
    linea.meses[f.periodo] += f.monto;
    linea.total += f.monto;
    tipos.set(f.tipo, linea);
  }

  const secciones: BloqueSeccion[] = SECCIONES.map(({ clave, etiqueta }) => {
    const tipos = [...(porSeccion.get(clave)?.values() ?? [])].sort((a, b) => a.orden - b.orden || a.tipo.localeCompare(b.tipo));
    const efecto = cero();
    for (const t of tipos) for (const m of meses) efecto[m] += t.meses[m] * t.signo;
    return { seccion: clave, etiqueta, tipos: tipos.map((t) => ({ tipo: t.tipo, signo: t.signo, meses: t.meses, total: t.total })), efecto, efectoTotal: suma(efecto) };
  });

  const efectoDe = (s: Seccion) => secciones.find((x) => x.seccion === s)!.efecto;
  const combinar = (...partes: PorMes[]): PorMes =>
    Object.fromEntries(meses.map((m) => [m, partes.reduce((a, p) => a + p[m], 0)]));

  const ingresosNetos = efectoDe("ingresos");
  const margenBruto = combinar(ingresosNetos, efectoDe("costo_ventas"));
  const ebitda = combinar(margenBruto, efectoDe("administracion"), efectoDe("marketing"));
  // La depreciación no toca el EBITDA: solo baja el EBIT y el resultado neto.
  const ebit = combinar(ebitda, efectoDe("depreciacion"));
  const resultadoNeto = combinar(...secciones.map((s) => s.efecto));
  const dividendos = cero();
  for (const t of secciones.find((s) => s.seccion === "otros")!.tipos) {
    if (/dividendo/i.test(t.tipo)) for (const m of meses) dividendos[m] += t.meses[m];
  }
  return { meses, secciones, ingresosNetos, margenBruto, ebitda, ebit, resultadoNeto, dividendos };
}

export const total = suma;

/** Porcentaje sobre los ingresos netos, o null sin ingresos (no se inventa un 0 %). */
export const sobre = (valor: number, ingresos: number): number | null => (ingresos > 0 ? (valor / ingresos) * 100 : null);

/** Los últimos `n` meses que terminan en el mes de `hoy` (AAAA-MM-DD), del más viejo al más nuevo. */
export function ultimosMeses(hoy: string, n: number): string[] {
  let anio = Number(hoy.slice(0, 4));
  let mes = Number(hoy.slice(5, 7));
  const meses: string[] = [];
  for (let i = 0; i < n; i++) {
    meses.unshift(`${anio}-${String(mes).padStart(2, "0")}-01`);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return meses;
}

/** Quita los meses del principio que no tienen ningún dato (el libro empieza en enero de 2026). */
export function recortarInicio(meses: string[], conDatos: Set<string>): string[] {
  const i = meses.findIndex((m) => conDatos.has(m));
  return i < 0 ? meses : meses.slice(i);
}

/** El último mes cerrado (el anterior al de `hoy`) y el que le precede. */
export function mesesComparables(meses: string[], hoy: string): { actual: string | null; anterior: string | null } {
  const enCurso = `${hoy.slice(0, 7)}-01`;
  const cerrados = meses.filter((m) => m < enCurso);
  return { actual: cerrados.at(-1) ?? null, anterior: cerrados.at(-2) ?? null };
}

/** Cambio relativo entre dos valores, o null si el anterior es cero. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

/** Valor de empresa = EBITDA anualizado × múltiplo (regla AF4). Con EBITDA negativo no hay valor creado. */
export function valorEmpresa(ebitdaAnual: number, multiplo: number): number {
  return Math.max(ebitdaAnual, 0) * multiplo;
}

/** Múltiplo de EBITDA de referencia para un e-commerce chico en LatAm (supuesto de gestión). */
export const MULTIPLO_EBITDA = 4;

/** «oct 26». */
export function mesCorto(periodo: string): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(2, 4)}`;
}

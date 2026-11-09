// Panel financiero (vista de CFO): junta en una pantalla lo que ya calculan el Estado de resultados, el Flujo de caja,
// las carteras, la nómina y los bienes de uso. Lógica pura: sirve en el servidor y en las pruebas (`panel.test.ts`).

import { MULTIPLO_EBITDA, sobre, valorEmpresa, variacion, type Eerr } from "./eerr";
import { compararConReal, serieDeEerr, serieDeLineas, type Comparacion } from "./presupuesto";

export interface ResumenResultados {
  meses: number;
  ingresos: number;
  ebitda: number;
  margenEbitda: number | null;
  resultadoNeto: number;
  /** EBITDA promedio de los meses con datos × 12. */
  ebitdaAnual: number;
  valorEmpresa: number;
  ultimoMes: string | null;
  ebitdaUltimoMes: number;
  ingresosUltimoMes: number;
  variacionEbitda: number | null;
}

/**
 * Lo que dice el EERR de la ventana. «Último mes» es el último con datos que no sea el mes en curso (un mes abierto
 * todavía no tiene todos sus ingresos) y que ya tenga ingresos: un mes cerrado con gastos cargados pero sin sus ventas
 * todavía (el libro llega por partes) mostraría una pérdida que no es. Si ninguno los tiene, el último cerrado; si solo
 * hay el mes en curso, ese.
 */
export function resumirResultados(eerr: Eerr, conDatos: Set<string>, mesEnCurso: string, multiplo = MULTIPLO_EBITDA): ResumenResultados {
  const conMovs = eerr.meses.filter((m) => conDatos.has(m));
  const suma = (o: Record<string, number>) => conMovs.reduce((a, m) => a + (o[m] ?? 0), 0);
  const ingresos = suma(eerr.ingresosNetos);
  const ebitda = suma(eerr.ebitda);
  const cerrados = conMovs.filter((m) => m < mesEnCurso);
  const conIngresos = cerrados.filter((m) => (eerr.ingresosNetos[m] ?? 0) > 0);
  const ultimoMes = conIngresos.at(-1) ?? cerrados.at(-1) ?? conMovs.at(-1) ?? null;
  const previo = ultimoMes ? conMovs[conMovs.indexOf(ultimoMes) - 1] : undefined;
  const ebitdaAnual = conMovs.length ? (ebitda / conMovs.length) * 12 : 0;
  return {
    meses: conMovs.length,
    ingresos,
    ebitda,
    margenEbitda: sobre(ebitda, ingresos),
    resultadoNeto: suma(eerr.resultadoNeto),
    ebitdaAnual,
    valorEmpresa: valorEmpresa(ebitdaAnual, multiplo),
    ultimoMes,
    ebitdaUltimoMes: ultimoMes ? (eerr.ebitda[ultimoMes] ?? 0) : 0,
    ingresosUltimoMes: ultimoMes ? (eerr.ingresosNetos[ultimoMes] ?? 0) : 0,
    variacionEbitda: ultimoMes && previo ? variacion(eerr.ebitda[ultimoMes] ?? 0, eerr.ebitda[previo] ?? 0) : null,
  };
}

export interface TotalCartera {
  clase: "cobrar" | "pagar";
  saldo: number | string;
  vencido: number | string;
  tramo_90_mas: number | string;
  documentos: number | string;
}

export interface ResumenCartera {
  porCobrar: number;
  cobrarVencido: number;
  cobrar90: number;
  porPagar: number;
  pagarVencido: number;
  pagar90: number;
  documentosCobrar: number;
  /** Por cobrar − por pagar (solo las carteras; sin inventario ni caja). */
  neto: number;
}

/** Suma las filas de `fin_cartera_totales` (una por cartera y tienda). */
export function resumirCartera(filas: TotalCartera[]): ResumenCartera {
  const r: ResumenCartera = { porCobrar: 0, cobrarVencido: 0, cobrar90: 0, porPagar: 0, pagarVencido: 0, pagar90: 0, documentosCobrar: 0, neto: 0 };
  for (const f of filas) {
    if (f.clase === "cobrar") {
      r.porCobrar += Number(f.saldo);
      r.cobrarVencido += Number(f.vencido);
      r.cobrar90 += Number(f.tramo_90_mas);
      r.documentosCobrar += Number(f.documentos);
    } else {
      r.porPagar += Number(f.saldo);
      r.pagarVencido += Number(f.vencido);
      r.pagar90 += Number(f.tramo_90_mas);
    }
  }
  r.neto = r.porCobrar - r.porPagar;
  return r;
}

/** Costo de nómina del mes (formal neto + externa) sobre los ingresos del mismo mes, en %. */
export function pesoNomina(costo: number, ingresosMes: number): number | null {
  return sobre(costo, ingresosMes);
}

export interface PendienteCierre {
  clave: string;
  titulo: string;
  descripcion: string;
  cantidad: number;
  href: string;
  accion: string;
  /** El módulo que hay que poder abrir para verlo. */
  modulo: string;
}

/** Lo que falta para cerrar el mes, lo pendiente primero; solo lo de los módulos que la persona abre. */
export function colaCierre(pendientes: PendienteCierre[], modulos: string[]): PendienteCierre[] {
  return pendientes
    .filter((p) => modulos.includes(p.modulo))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(b.p.cantidad > 0) - Number(a.p.cantidad > 0) || a.i - b.i)
    .map(({ p }) => p);
}

export interface VsPresupuesto {
  /** Los meses comparados: los del año ya cerrados y con datos. */
  meses: string[];
  ingresos: Comparacion;
  ebitda: Comparacion;
}

/**
 * Ingresos y EBITDA del año a la fecha contra el presupuesto (escenario base, todas las tiendas): los meses del año de
 * `mesEnCurso` que ya cerraron y tienen datos. null si todavía no hay ninguno.
 */
export function vsPresupuestoAcumulado(
  eerr: Eerr,
  conDatos: Set<string>,
  mesEnCurso: string,
  lineas: { escenario: string; periodo: string; unidad_id: string | null; seccion: string; monto: number }[],
): VsPresupuesto | null {
  const anio = mesEnCurso.slice(0, 4);
  const meses = eerr.meses.filter((m) => m.startsWith(anio) && m < mesEnCurso && conDatos.has(m));
  if (!meses.length) return null;
  const filas = compararConReal(serieDeLineas(lineas, "base", meses), serieDeEerr(eerr), meses);
  const de = (c: string) => filas.find((f) => f.concepto === c)!.acumulado;
  return { meses, ingresos: de("ingresos"), ebitda: de("ebitda") };
}

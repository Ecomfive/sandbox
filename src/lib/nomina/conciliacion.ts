// Conciliación nómina ↔ libro de movimientos (lógica pura; la pantalla es /nomina/conciliacion). Prueba en
// `conciliacion.test.ts`.
//
// Qué se compara:
//  * Planilla formal (lo pagado, el neto) contra el tipo SUELDOS del libro: el libro carga cada transferencia neta.
//    Las retenciones (Seguro Social y Educativo) se pagan a la Caja en otro movimiento (Otros gastos de administración).
//  * Nómina externa (total USDT de cada pago) contra OTROS SUELDOS.
// Por mes se compara contra todo lo que el libro cargó al EERR (EERR = SI); por tienda, contra el EERR ya repartido
// (`fin_eerr_mensual`), y la nómina de «A DISTRIBUIR» se reparte con la misma base de envíos que usa el libro.
// La conciliación no escribe en el libro (sería contar dos veces el mismo sueldo).

import type { TipoNomina } from "./excel";

export const TIPO_LIBRO: Record<TipoNomina, string> = { formal: "SUELDOS", externa: "OTROS SUELDOS" };
export const TIPOS_SUELDO = Object.values(TIPO_LIBRO);

export interface CostoNomina {
  periodo: string;
  tipo: TipoNomina;
  unidad: string;
  neto: number;
}

export interface MovimientoSueldo {
  periodo: string;
  unidad: string;
  /** «SUELDOS» u «OTROS SUELDOS». */
  tipo: string;
  en_eerr: boolean;
  monto: number;
  descripcion: string;
  fecha: string | null;
}

export interface EerrSueldo {
  periodo: string;
  unidad: string;
  tipo: string;
  monto: number;
}

export interface BaseReparto {
  periodo: string;
  unidad: string;
  envios: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const sumar = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
const tipoLibroNormal = (t: string) => t.trim().toUpperCase();

export interface FilaMes {
  periodo: string;
  formal: number;
  sueldosLibro: number;
  difFormal: number;
  externa: number;
  otrosLibro: number;
  difExterna: number;
  /** Sueldos del libro marcados «EERR = NO» (no entran al EERR). */
  fueraEerr: number;
  comision: number;
  /** Libro − nómina, de los dos tipos. */
  diferencia: number;
}

/** Por mes: nómina contra lo que el libro cargó al EERR en SUELDOS y OTROS SUELDOS. */
export function conciliarPorMes(costos: CostoNomina[], libro: MovimientoSueldo[], comisiones: Record<string, number> = {}): FilaMes[] {
  const meses = [...new Set([...costos.map((c) => c.periodo), ...libro.map((m) => m.periodo)])].sort();
  return meses.map((periodo) => {
    const c = costos.filter((x) => x.periodo === periodo);
    const l = libro.filter((x) => x.periodo === periodo);
    const formal = sumar(c.filter((x) => x.tipo === "formal").map((x) => x.neto));
    const externa = sumar(c.filter((x) => x.tipo === "externa").map((x) => x.neto));
    const enLibro = (tipo: string) => sumar(l.filter((x) => x.en_eerr && tipoLibroNormal(x.tipo) === tipo).map((x) => x.monto));
    const sueldosLibro = enLibro(TIPO_LIBRO.formal);
    const otrosLibro = enLibro(TIPO_LIBRO.externa);
    return {
      periodo,
      formal,
      sueldosLibro,
      difFormal: r2(sueldosLibro - formal),
      externa,
      otrosLibro,
      difExterna: r2(otrosLibro - externa),
      fueraEerr: sumar(l.filter((x) => !x.en_eerr).map((x) => x.monto)),
      comision: r2(comisiones[periodo] ?? 0),
      diferencia: r2(sueldosLibro + otrosLibro - formal - externa),
    };
  });
}

/**
 * Reparte lo de las unidades de reparto (A DISTRIBUIR) entre las tiendas según sus envíos del mes, como la vista
 * `fin_eerr_mensual`. Sin base de envíos ese mes, queda «sin repartir».
 */
export function repartir(
  montos: Map<string, number>,
  base: BaseReparto[],
  unidadesReparto: Set<string>,
): { porTienda: Map<string, number>; sinRepartir: number } {
  const conEnvios = base.filter((b) => b.envios > 0);
  const totalEnvios = conEnvios.reduce((a, b) => a + b.envios, 0);
  const porTienda = new Map<string, number>();
  let sinRepartir = 0;
  for (const [unidad, monto] of montos) {
    if (!unidadesReparto.has(unidad)) {
      porTienda.set(unidad, (porTienda.get(unidad) ?? 0) + monto);
      continue;
    }
    if (totalEnvios <= 0) {
      sinRepartir += monto;
      continue;
    }
    for (const b of conEnvios) porTienda.set(b.unidad, (porTienda.get(b.unidad) ?? 0) + (monto * b.envios) / totalEnvios);
  }
  return { porTienda: new Map([...porTienda].map(([k, v]) => [k, r2(v)])), sinRepartir: r2(sinRepartir) };
}

export interface FilaTienda {
  unidad: string;
  nominaFormal: number;
  libroSueldos: number;
  nominaExterna: number;
  libroOtros: number;
  diferencia: number;
}

/**
 * Un mes por tienda: la nómina (con A DISTRIBUIR repartido por envíos) contra el EERR del libro ya repartido. La última
 * fila, «Sin repartir», junta lo de A DISTRIBUIR de un mes sin base de envíos (de los dos lados).
 */
export function conciliarPorTienda(
  periodo: string,
  costos: CostoNomina[],
  eerr: EerrSueldo[],
  libro: MovimientoSueldo[],
  base: BaseReparto[],
  unidadesReparto: Set<string>,
): FilaTienda[] {
  const delMes = base.filter((b) => b.periodo === periodo);
  const nomina = (tipo: TipoNomina) => {
    const m = new Map<string, number>();
    for (const c of costos) if (c.periodo === periodo && c.tipo === tipo) m.set(c.unidad, (m.get(c.unidad) ?? 0) + c.neto);
    return repartir(m, delMes, unidadesReparto);
  };
  const formal = nomina("formal");
  const externa = nomina("externa");
  const enEerr = (tipo: string) => {
    const m = new Map<string, number>();
    for (const e of eerr) if (e.periodo === periodo && tipoLibroNormal(e.tipo) === tipo) m.set(e.unidad, r2((m.get(e.unidad) ?? 0) + e.monto));
    return m;
  };
  const sueldos = enEerr(TIPO_LIBRO.formal);
  const otros = enEerr(TIPO_LIBRO.externa);
  // Lo del libro en A DISTRIBUIR que la vista no repartió (mes sin base).
  const libroSinRepartir = (tipo: string) =>
    delMes.some((b) => b.envios > 0)
      ? 0
      : sumar(libro.filter((m) => m.periodo === periodo && m.en_eerr && tipoLibroNormal(m.tipo) === tipo && unidadesReparto.has(m.unidad)).map((m) => m.monto));

  const unidades = [...new Set([...formal.porTienda.keys(), ...externa.porTienda.keys(), ...sueldos.keys(), ...otros.keys()])].sort();
  const filas: FilaTienda[] = unidades.map((unidad) => {
    const f = {
      unidad,
      nominaFormal: r2(formal.porTienda.get(unidad) ?? 0),
      libroSueldos: r2(sueldos.get(unidad) ?? 0),
      nominaExterna: r2(externa.porTienda.get(unidad) ?? 0),
      libroOtros: r2(otros.get(unidad) ?? 0),
    };
    return { ...f, diferencia: r2(f.libroSueldos + f.libroOtros - f.nominaFormal - f.nominaExterna) };
  });
  const sr = {
    nominaFormal: formal.sinRepartir,
    libroSueldos: libroSinRepartir(TIPO_LIBRO.formal),
    nominaExterna: externa.sinRepartir,
    libroOtros: libroSinRepartir(TIPO_LIBRO.externa),
  };
  if (Object.values(sr).some((v) => v !== 0)) {
    filas.push({ unidad: "Sin repartir", ...sr, diferencia: r2(sr.libroSueldos + sr.libroOtros - sr.nominaFormal - sr.nominaExterna) });
  }
  return filas.filter((f) => f.nominaFormal || f.libroSueldos || f.nominaExterna || f.libroOtros);
}

export interface Explicacion {
  texto: string;
  monto: number;
  /** Si es parte de la diferencia del mes (libro − nómina) o solo un dato al lado (lo de fuera del EERR, la comisión). */
  explica: boolean;
}

/** Lo que queda de la diferencia después de restar lo explicado. */
export function sinExplicar(fila: FilaMes, explicaciones: Explicacion[]): number {
  return r2(fila.diferencia - explicaciones.filter((e) => e.explica).reduce((a, e) => a + e.monto, 0));
}

/**
 * Lo que explica una diferencia del mes, a partir de los movimientos del libro y de la nómina: pagos a la Caja de Seguro
 * Social cargados como sueldo, liquidaciones o décimo que la planilla no trae, sueldos fuera del EERR y la comisión de
 * Binance (que no es de ninguna persona).
 */
export function explicarDiferencias(fila: FilaMes, libro: MovimientoSueldo[], retenciones: number): Explicacion[] {
  const delMes = libro.filter((m) => m.periodo === fila.periodo && m.en_eerr);
  const salida: Explicacion[] = [];
  const buscar = (re: RegExp) => sumar(delMes.filter((m) => re.test(m.descripcion.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase())).map((m) => m.monto));
  const css = buscar(/\bCSS\b|SEGURO SOCIAL|CAJA DE SEGURO/);
  if (css) salida.push({ texto: "Pago a la Caja de Seguro Social cargado como sueldo (la planilla lo descuenta del neto)", monto: css, explica: true });
  const liquidaciones = buscar(/LIQUIDACI|TERMINACION|DECIMO|XIII|VACACION|PRIMA DE ANTIG/);
  if (liquidaciones) salida.push({ texto: "Liquidaciones, décimo o vacaciones (no están en la planilla)", monto: liquidaciones, explica: true });
  if (fila.fueraEerr) salida.push({ texto: "Sueldos del libro con «EERR = NO» (no entran al EERR)", monto: fila.fueraEerr, explica: false });
  if (fila.difFormal > 1 && fila.difExterna < -1) {
    // Pasa de un tipo al otro: no cambia la diferencia total.
    salida.push({ texto: "Parte de la nómina externa puede estar cargada como SUELDOS en el libro", monto: r2(Math.min(fila.difFormal, -fila.difExterna)), explica: false });
  }
  if (fila.comision) salida.push({ texto: "Comisión P2P / Binance del mes (no es de ninguna persona)", monto: fila.comision, explica: false });
  if (!css && retenciones && Math.abs(fila.difFormal - retenciones) <= 1) {
    salida.push({ texto: "La diferencia de la planilla es igual a las retenciones: el libro cargó el bruto y no el neto", monto: retenciones, explica: true });
  }
  return salida;
}

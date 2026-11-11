// Portal AF4 360° › Distribución de utilidades. Lógica pura: reparte la utilidad de cada tienda entre los socios con
// los porcentajes vigentes cada mes (`fin_participaciones`, migración 0904), le resta a cada socio los retiros de
// dividendos que se le atribuyen y da su saldo. Sirve en el servidor y en el cliente. Prueba en `utilidades.test.ts`.
//
// Base (decisión, ver FINANZAS-360.md): la utilidad de cada tienda ANTES de retiros de dividendos, es decir el resultado
// neto del EERR (misma vista `fin_eerr_mensual`, mismo reparto de A DISTRIBUIR) sin el tipo «Retiro de dividendos». Todo
// retiro, esté cargado a CORPORATIVO o a una tienda, es plata que un socio ya se llevó: se le resta a ese socio, no a la
// utilidad de la tienda. La hoja EERR de Majo hace casi lo mismo (los retiros de CORPORATIVO no se reparten y van como
// «pagos» del socio), salvo los pocos retiros cargados a una tienda, que allá achican la utilidad de todos los socios.

import type { PorMes } from "./eerr";
import { normalizar } from "./clasificacion";

/** Una fila de `fin_eerr_mensual` (ya con el nombre del tipo). */
export interface FilaResultado {
  periodo: string;
  unidad_id: string;
  tipo: string;
  /** Efecto en el resultado: positivo suma, negativo resta. */
  efecto: number;
}

export interface Socio {
  id: string;
  nombre: string;
  alias: string[];
}

export interface Participacion {
  socio_id: string;
  unidad_id: string;
  /** 0 a 100. */
  porcentaje: number;
  /** AAAA-MM-01. */
  vigente_desde: string;
}

export interface Retiro {
  id: string;
  periodo: string;
  unidad_id: string;
  descripcion: string;
  monto: number;
  /** Atribuido a mano (manda sobre los alias). */
  socio_manual: string | null;
}

export const esRetiroDeDividendos = (tipo: string) => /dividendo/i.test(tipo);

const redondear = (v: number) => Math.round(v * 100) / 100;

/** Utilidad antes de retiros de cada unidad por mes. */
export function utilidadPorUnidad(filas: FilaResultado[], meses: string[]): Map<string, PorMes> {
  const enVentana = new Set(meses);
  const salida = new Map<string, PorMes>();
  for (const f of filas) {
    if (!enVentana.has(f.periodo) || esRetiroDeDividendos(f.tipo)) continue;
    const porMes = salida.get(f.unidad_id) ?? Object.fromEntries(meses.map((m) => [m, 0]));
    porMes[f.periodo] = redondear(porMes[f.periodo] + f.efecto);
    salida.set(f.unidad_id, porMes);
  }
  return salida;
}

/** El porcentaje de cada socio en una unidad para un mes: la fila más reciente con `vigente_desde` ≤ mes. */
export function porcentajesVigentes(participaciones: Participacion[], unidadId: string, mes: string): Map<string, number> {
  const ultima = new Map<string, Participacion>();
  for (const p of participaciones) {
    if (p.unidad_id !== unidadId || p.vigente_desde > mes) continue;
    const previa = ultima.get(p.socio_id);
    if (!previa || p.vigente_desde > previa.vigente_desde) ultima.set(p.socio_id, p);
  }
  const salida = new Map<string, number>();
  for (const [socio, p] of ultima) if (p.porcentaje > 0) salida.set(socio, p.porcentaje);
  return salida;
}

/**
 * A qué socio se atribuye un retiro: el elegido a mano o, si no, el socio cuyo alias aparece primero en la
 * descripción (sin mayúsculas ni acentos). Sin coincidencia, null («sin atribuir»).
 */
export function socioDelRetiro(retiro: Pick<Retiro, "descripcion" | "socio_manual">, socios: Socio[]): string | null {
  if (retiro.socio_manual) return retiro.socio_manual;
  const texto = normalizar(retiro.descripcion);
  let mejor: { socio: string; pos: number; largo: number } | null = null;
  for (const s of socios) {
    for (const a of s.alias) {
      const alias = normalizar(a);
      if (alias.length < 3) continue;
      const pos = texto.indexOf(alias);
      if (pos < 0) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && alias.length > mejor.largo)) mejor = { socio: s.id, pos, largo: alias.length };
    }
  }
  return mejor?.socio ?? null;
}

export interface RepartoUnidad {
  unidad_id: string;
  utilidad: PorMes;
  /** Lo que se le asignó a algún socio. */
  repartido: PorMes;
  /** Utilidad sin socio (la unidad no tiene porcentajes o no llegan a 100 %). */
  sinRepartir: PorMes;
  /** Suma de porcentajes por mes (para avisar si pasa de 100). */
  sumaPorcentajes: PorMes;
  /** Parte de cada socio por mes. */
  porSocio: Map<string, PorMes>;
}

export interface CuentaSocio {
  socio_id: string;
  parte: PorMes;
  /** Positivos: lo que se llevó. */
  retiros: PorMes;
  /** Parte − retiros del mes. */
  neto: PorMes;
  /** Saldo acumulado al cierre de cada mes (desde el primer mes pedido): positivo = a favor del socio. */
  saldo: PorMes;
}

export interface Distribucion {
  meses: string[];
  unidades: RepartoUnidad[];
  socios: CuentaSocio[];
  retirosSinAtribuir: PorMes;
}

/**
 * Reparte la utilidad de cada unidad en cada mes y arma la cuenta de cada socio. Pasar todos los meses desde el
 * primero con datos para que el saldo sea el acumulado real.
 */
export function distribuir(params: {
  meses: string[];
  utilidades: Map<string, PorMes>;
  participaciones: Participacion[];
  socios: Socio[];
  retiros: Retiro[];
}): Distribucion {
  const { meses, utilidades, participaciones, socios, retiros } = params;
  const cero = (): PorMes => Object.fromEntries(meses.map((m) => [m, 0]));
  const cuentas = new Map<string, CuentaSocio>(
    socios.map((s) => [s.id, { socio_id: s.id, parte: cero(), retiros: cero(), neto: cero(), saldo: cero() }]),
  );
  const cuentaDe = (id: string) => {
    let c = cuentas.get(id);
    if (!c) {
      c = { socio_id: id, parte: cero(), retiros: cero(), neto: cero(), saldo: cero() };
      cuentas.set(id, c);
    }
    return c;
  };

  const unidades: RepartoUnidad[] = [];
  for (const [unidadId, utilidad] of utilidades) {
    const r: RepartoUnidad = { unidad_id: unidadId, utilidad, repartido: cero(), sinRepartir: cero(), sumaPorcentajes: cero(), porSocio: new Map() };
    for (const m of meses) {
      const pcts = porcentajesVigentes(participaciones, unidadId, m);
      let repartido = 0;
      let sumaPct = 0;
      for (const [socio, pct] of pcts) {
        const parte = redondear((utilidad[m] * pct) / 100);
        const porMes = r.porSocio.get(socio) ?? cero();
        porMes[m] = parte;
        r.porSocio.set(socio, porMes);
        cuentaDe(socio).parte[m] = redondear(cuentaDe(socio).parte[m] + parte);
        repartido += parte;
        sumaPct += pct;
      }
      r.repartido[m] = redondear(repartido);
      r.sinRepartir[m] = redondear(utilidad[m] - repartido);
      r.sumaPorcentajes[m] = Math.round(sumaPct * 10000) / 10000;
    }
    unidades.push(r);
  }

  const retirosSinAtribuir = cero();
  const enVentana = new Set(meses);
  for (const ret of retiros) {
    if (!enVentana.has(ret.periodo)) continue;
    const socio = socioDelRetiro(ret, socios);
    if (socio) cuentaDe(socio).retiros[ret.periodo] = redondear(cuentaDe(socio).retiros[ret.periodo] + ret.monto);
    else retirosSinAtribuir[ret.periodo] = redondear(retirosSinAtribuir[ret.periodo] + ret.monto);
  }

  for (const c of cuentas.values()) {
    let acumulado = 0;
    for (const m of meses) {
      c.neto[m] = redondear(c.parte[m] - c.retiros[m]);
      acumulado = redondear(acumulado + c.neto[m]);
      c.saldo[m] = acumulado;
    }
  }
  const orden = new Map(socios.map((s, i) => [s.id, i]));
  return {
    meses,
    unidades,
    socios: [...cuentas.values()].sort((a, b) => (orden.get(a.socio_id) ?? 99) - (orden.get(b.socio_id) ?? 99)),
    retirosSinAtribuir,
  };
}

/** Suma de los meses pedidos de un PorMes. */
export function sumaEn(valores: PorMes, meses: string[]): number {
  return redondear(meses.reduce((a, m) => a + (valores[m] ?? 0), 0));
}

// ---------------------------------------------------------------------------------------------
// Filas de las tablas (la página las muestra tal cual)
// ---------------------------------------------------------------------------------------------

export interface FilaTablaUtilidades {
  clave: string;
  etiqueta: string;
  tipo: "grupo" | "detalle" | "resultado";
  valores: PorMes;
  total?: number | null;
}

const negar = (o: PorMes, meses: string[]): PorMes => Object.fromEntries(meses.map((m) => [m, -(o[m] ?? 0)]));
const fmtPct = (v: number) => `${v.toLocaleString("es-PA", { maximumFractionDigits: 2 })} %`;

/**
 * Cada socio: su saldo acumulado (desde el primer mes con datos) y, debajo, su parte de la utilidad, sus retiros y el
 * neto del mes, en los meses de la ventana. Al final, los retiros que no se pudieron atribuir.
 */
export function filasPorSocio(d: Distribucion, nombres: Map<string, string>, ventana: string[]): FilaTablaUtilidades[] {
  const ultimo = ventana[ventana.length - 1];
  const filas: FilaTablaUtilidades[] = [];
  for (const c of d.socios) {
    const conAlgo = ventana.some((m) => c.parte[m] || c.retiros[m]) || c.saldo[ultimo];
    if (!conAlgo) continue;
    const nombre = nombres.get(c.socio_id) ?? "—";
    filas.push({ clave: `${c.socio_id}-saldo`, etiqueta: `${nombre} · saldo acumulado`, tipo: "grupo", valores: c.saldo, total: c.saldo[ultimo] });
    filas.push({ clave: `${c.socio_id}-parte`, etiqueta: "Parte de la utilidad", tipo: "detalle", valores: c.parte });
    filas.push({ clave: `${c.socio_id}-retiros`, etiqueta: "Retiros", tipo: "detalle", valores: negar(c.retiros, ventana) });
    filas.push({ clave: `${c.socio_id}-neto`, etiqueta: "Neto del mes", tipo: "detalle", valores: c.neto });
  }
  if (ventana.some((m) => d.retirosSinAtribuir[m])) {
    filas.push({ clave: "sin-atribuir", etiqueta: "Retiros sin atribuir", tipo: "resultado", valores: negar(d.retirosSinAtribuir, ventana) });
  }
  return filas;
}

/**
 * Cada tienda: su utilidad antes de retiros y, debajo, la parte de cada socio (con el porcentaje del último mes) y lo
 * que quedó sin repartir. Se omiten las unidades sin utilidad en la ventana.
 */
export function filasPorTienda(
  d: Distribucion,
  participaciones: Participacion[],
  nombresUnidad: Map<string, string>,
  nombresSocio: Map<string, string>,
  ventana: string[],
  ordenUnidad: Map<string, number> = new Map(),
): FilaTablaUtilidades[] {
  const ultimo = ventana[ventana.length - 1];
  const filas: FilaTablaUtilidades[] = [];
  const unidades = [...d.unidades].sort((a, b) => (ordenUnidad.get(a.unidad_id) ?? 999) - (ordenUnidad.get(b.unidad_id) ?? 999));
  for (const u of unidades) {
    if (!ventana.some((m) => u.utilidad[m])) continue;
    filas.push({ clave: `${u.unidad_id}-utilidad`, etiqueta: nombresUnidad.get(u.unidad_id) ?? "—", tipo: "grupo", valores: u.utilidad });
    const pcts = porcentajesVigentes(participaciones, u.unidad_id, ultimo);
    for (const [socio, valores] of u.porSocio) {
      if (!ventana.some((m) => valores[m])) continue;
      const pct = pcts.get(socio);
      const etiqueta = `${nombresSocio.get(socio) ?? "—"}${pct === undefined ? "" : ` · ${fmtPct(pct)}`}`;
      filas.push({ clave: `${u.unidad_id}-${socio}`, etiqueta, tipo: "detalle", valores });
    }
    if (ventana.some((m) => Math.abs(u.sinRepartir[m]) >= 0.01)) {
      filas.push({ clave: `${u.unidad_id}-sin`, etiqueta: "Sin repartir", tipo: "detalle", valores: u.sinRepartir });
    }
  }
  return filas;
}

/** Valida un porcentaje que llega de un formulario: «47,5» o «47.5» → 47.5; fuera de 0–100 → null. */
export function leerPorcentaje(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = typeof v === "number" ? v : Number(v.trim().replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10000) / 10000;
}

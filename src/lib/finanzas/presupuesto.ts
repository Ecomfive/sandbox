// Portal AF4 360° › Presupuesto y escenarios. Lógica pura (sirve en el servidor y en el cliente): genera el presupuesto
// del año desde el EERR real (`fin_eerr_mensual`) con supuestos por escenario (Conservador, Base, Optimista), lo compara
// con el real mes a mes y acumulado, y arma la matriz de sensibilidad del EBITDA. Prueba en `presupuesto.test.ts`.
//
// Montos «como se leen en el EERR»: los ingresos netos en positivo y cada sección de costos y gastos en positivo (lo
// que se gastó). El efecto en el resultado es `monto × SIGNO_SECCION[seccion]`. Es lo que guarda
// `fin_presupuesto_lineas.monto` (migración 0913).

import { MULTIPLO_EBITDA, SECCIONES, valorEmpresa, type Eerr, type PorMes, type Seccion } from "./eerr";

export type Escenario = "conservador" | "base" | "optimista";

export const ESCENARIOS: { clave: Escenario; etiqueta: string }[] = [
  { clave: "conservador", etiqueta: "Conservador" },
  { clave: "base", etiqueta: "Base" },
  { clave: "optimista", etiqueta: "Optimista" },
];

export const esEscenario = (v: unknown): v is Escenario => v === "conservador" || v === "base" || v === "optimista";
export const esSeccion = (v: unknown): v is Seccion => SECCIONES.some((s) => s.clave === v);

/** +1 los ingresos, −1 todo lo demás: el efecto de cada sección en el resultado. */
export const SIGNO_SECCION: Record<Seccion, 1 | -1> = {
  ingresos: 1,
  costo_ventas: -1,
  administracion: -1,
  marketing: -1,
  depreciacion: -1,
  finanzas: -1,
  otros: -1,
  impuesto_ganancias: -1,
};

export type EstadoPresupuesto = "borrador" | "aprobado" | "cerrado";
export const ESTADOS_PRESUPUESTO: { clave: EstadoPresupuesto; etiqueta: string }[] = [
  { clave: "borrador", etiqueta: "Borrador" },
  { clave: "aprobado", etiqueta: "Aprobado" },
  { clave: "cerrado", etiqueta: "Cerrado" },
];

/** Los pasos permitidos: borrador → aprobado → cerrado, y un aprobado puede volver a borrador. */
export function puedePasar(de: EstadoPresupuesto, a: EstadoPresupuesto): boolean {
  return (de === "borrador" && a === "aprobado") || (de === "aprobado" && (a === "cerrado" || a === "borrador"));
}

/**
 * El presupuesto contra el que se mide un año (Panel e Informe): el elegido si está en la lista; si no, el aprobado más
 * reciente; si no hay aprobado, el primero de la lista (que va del más nuevo al más viejo).
 */
export function elegirPresupuesto<T extends { id: string; estado: EstadoPresupuesto; aprobado_en: string | null }>(lista: T[], elegido?: unknown): T | null {
  const pedido = typeof elegido === "string" ? lista.find((p) => p.id === elegido) : undefined;
  if (pedido) return pedido;
  const aprobados = lista.filter((p) => p.estado === "aprobado").sort((a, b) => (b.aprobado_en ?? "").localeCompare(a.aprobado_en ?? ""));
  return aprobados[0] ?? lista[0] ?? null;
}

/** Por sección, sus montos por mes como se leen en el EERR. */
export type SerieSecciones = Record<Seccion, PorMes>;

/** Los gastos que no son el costo de ventas. */
export const SECCIONES_GASTO = ["administracion", "marketing", "finanzas", "otros", "impuesto_ganancias"] as const;
export type SeccionGasto = (typeof SECCIONES_GASTO)[number];

/** Un gasto se presupuesta como % de los ingresos (variable) o como un monto mensual fijo que sube con la inflación. */
export interface SupuestoGasto {
  modo: "pct" | "fijo";
  /** % de los ingresos o monto mensual en USD (a la mitad de los meses base). */
  valor: number;
}

export interface SupuestosEscenario {
  /** Crecimiento mensual compuesto de los ingresos, en %. */
  crecimientoMensual: number;
  /** Margen bruto objetivo, en % de los ingresos (el costo de ventas es el resto). */
  margenBruto: number;
  /** Inflación anual de los gastos fijos, en %. */
  inflacionAnual: number;
  gastos: Record<SeccionGasto, SupuestoGasto>;
}

export interface Supuestos {
  version: 1;
  /** Meses del real sobre los que se calcularon los supuestos (AAAA-MM-01). */
  mesesBase: string[];
  escenarios: Record<Escenario, SupuestosEscenario>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Meses
// ---------------------------------------------------------------------------------------------------------------------

const indiceMes = (periodo: string) => Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1;
const deIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;

/** Los 12 meses de un año. */
export const mesesDelAnio = (anio: number): string[] => Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}-01`);

/** Del mes `desde` al `hasta`, los dos incluidos (AAAA-MM-01). Vacío si están al revés. */
export function rangoMeses(desde: string, hasta: string): string[] {
  const a = indiceMes(desde);
  const b = indiceMes(hasta);
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(deIndice(i));
  return out;
}

/** «2026-03» o «2026-03-01» → «2026-03-01»; cualquier otra cosa → null. */
export function leerMes(v: unknown): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(String(v ?? "").trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Del EERR real a la serie por sección
// ---------------------------------------------------------------------------------------------------------------------

export const serieVacia = (meses: string[]): SerieSecciones =>
  Object.fromEntries(SECCIONES.map((s) => [s.clave, Object.fromEntries(meses.map((m) => [m, 0]))])) as SerieSecciones;

/**
 * El EERR real como serie por sección. En «Otros» se quitan los retiros de dividendos: no son un gasto del negocio y
 * no se presupuestan (el EERR de Excel los trata como gasto; ver `Eerr.dividendos`).
 */
export function serieDeEerr(eerr: Eerr): SerieSecciones {
  const serie = serieVacia(eerr.meses);
  for (const b of eerr.secciones) {
    for (const m of eerr.meses) {
      const v = b.efecto[m] * SIGNO_SECCION[b.seccion] - (b.seccion === "otros" ? eerr.dividendos[m] : 0);
      serie[b.seccion][m] = redondear(v);
    }
  }
  return serie;
}

/** Suma varias series (de varias tiendas) en los meses dados. */
export function sumarSeries(series: SerieSecciones[], meses: string[]): SerieSecciones {
  const total = serieVacia(meses);
  for (const s of series) for (const { clave } of SECCIONES) for (const m of meses) total[clave][m] += s[clave]?.[m] ?? 0;
  return total;
}

// ---------------------------------------------------------------------------------------------------------------------
// Resultados que salen de una serie
// ---------------------------------------------------------------------------------------------------------------------

export interface Derivados {
  ingresos: PorMes;
  margenBruto: PorMes;
  ebitda: PorMes;
  resultado: PorMes;
}

export function derivados(serie: SerieSecciones, meses: string[]): Derivados {
  const de = (f: (m: string) => number): PorMes => Object.fromEntries(meses.map((m) => [m, f(m)]));
  const v = (s: Seccion, m: string) => serie[s][m] ?? 0;
  const margenBruto = de((m) => v("ingresos", m) - v("costo_ventas", m));
  const ebitda = de((m) => margenBruto[m] - v("administracion", m) - v("marketing", m));
  const resultado = de((m) => ebitda[m] - v("depreciacion", m) - v("finanzas", m) - v("otros", m) - v("impuesto_ganancias", m));
  return { ingresos: de((m) => v("ingresos", m)), margenBruto, ebitda, resultado };
}

export const sumaEn = (o: PorMes, meses: string[]) => meses.reduce((a, m) => a + (o[m] ?? 0), 0);
export const redondear = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Supuestos por defecto
// ---------------------------------------------------------------------------------------------------------------------

/** Tope de la tendencia: ±10 % mensual. Más que eso en pocos meses es ruido, no tendencia. */
export const TOPE_TENDENCIA = 10;
/** Conservador: gastos 5 % más caros que en los meses base. Optimista: 2 % más baratos. */
export const AJUSTE_COSTOS: Record<Escenario, number> = { conservador: 5, base: 0, optimista: -2 };
/** Optimista: la tendencia (o 0 si es negativa) más 1 punto mensual. */
export const EXTRA_OPTIMISTA = 1;
/** Inflación anual de los gastos fijos en Panamá (supuesto de gestión). */
export const INFLACION_PREDETERMINADA = 2;

/**
 * Crecimiento mensual de los ingresos según los meses base: la pendiente de una recta sobre el logaritmo de los
 * ingresos (crecimiento compuesto), con tope ±10 %. Sin al menos dos meses con ingresos positivos, 0.
 */
export function tendenciaMensual(ingresos: number[]): number {
  const puntos = ingresos.map((y, x) => ({ x, y })).filter((p) => p.y > 0);
  if (puntos.length < 2) return 0;
  const n = puntos.length;
  const mx = puntos.reduce((a, p) => a + p.x, 0) / n;
  const my = puntos.reduce((a, p) => a + Math.log(p.y), 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.x - mx) * (Math.log(p.y) - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return 0;
  const g = (Math.exp(num / den) - 1) * 100;
  return Math.max(-TOPE_TENDENCIA, Math.min(TOPE_TENDENCIA, redondearA(g, 2)));
}

const redondearA = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Cómo se presupuesta cada gasto por defecto: administración y marketing crecen con las ventas; el resto es fijo. */
export const MODO_PREDETERMINADO: Record<SeccionGasto, SupuestoGasto["modo"]> = {
  administracion: "pct",
  marketing: "pct",
  finanzas: "fijo",
  otros: "fijo",
  impuesto_ganancias: "fijo",
};

/**
 * Los supuestos de cada escenario a partir del real de los meses base (la serie consolidada):
 * - Base: la tendencia de los ingresos, el margen bruto de los meses base y cada gasto como en los meses base (como %
 *   de los ingresos o como su promedio mensual, según `modos`).
 * - Conservador: crecimiento 0 % y costos y gastos 5 % más caros.
 * - Optimista: la tendencia (o 0 si es negativa) + 1 punto y costos y gastos 2 % más baratos.
 */
export function supuestosPorDefecto(
  serie: SerieSecciones,
  mesesBase: string[],
  modos: Partial<Record<SeccionGasto, SupuestoGasto["modo"]>> = {},
): Supuestos {
  const ingresos = sumaEn(serie.ingresos, mesesBase);
  const n = mesesBase.length || 1;
  const conIngresos = ingresos > 0;
  const tendencia = tendenciaMensual(mesesBase.map((m) => serie.ingresos[m] ?? 0));
  const costoPct = conIngresos ? (sumaEn(serie.costo_ventas, mesesBase) / ingresos) * 100 : 0;

  const escenario = (e: Escenario): SupuestosEscenario => {
    const ajuste = 1 + AJUSTE_COSTOS[e] / 100;
    const crecimiento = e === "conservador" ? 0 : e === "base" ? tendencia : Math.max(tendencia, 0) + EXTRA_OPTIMISTA;
    const gastos = Object.fromEntries(
      SECCIONES_GASTO.map((s) => {
        const modo = conIngresos ? (modos[s] ?? MODO_PREDETERMINADO[s]) : "fijo";
        const suma = sumaEn(serie[s], mesesBase);
        const valor = modo === "pct" ? (suma / ingresos) * 100 : suma / n;
        return [s, { modo, valor: redondearA(valor * ajuste, modo === "pct" ? 2 : 0) }];
      }),
    ) as Record<SeccionGasto, SupuestoGasto>;
    return {
      crecimientoMensual: redondearA(crecimiento, 2),
      margenBruto: redondearA(100 - costoPct * ajuste, 2),
      inflacionAnual: INFLACION_PREDETERMINADA,
      gastos,
    };
  };
  return {
    version: 1,
    mesesBase,
    escenarios: { conservador: escenario("conservador"), base: escenario("base"), optimista: escenario("optimista") },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Generar el presupuesto
// ---------------------------------------------------------------------------------------------------------------------

/** El mes del medio de los meses base (puede caer entre dos meses): ahí se ancla el promedio. */
const centroDe = (mesesBase: string[]) => mesesBase.reduce((a, m) => a + indiceMes(m), 0) / (mesesBase.length || 1);

/**
 * El presupuesto consolidado de un escenario, mes a mes. Los ingresos parten del promedio de los meses base, anclado en
 * el mes del medio, y crecen (o caen) al ritmo mensual del escenario; el costo de ventas es el resto del margen bruto;
 * un gasto en % sigue a los ingresos y uno fijo sube con la inflación anual desde ese mismo mes del medio.
 */
export function proyectar(
  supuestos: SupuestosEscenario,
  ingresosBase: number,
  mesesBase: string[],
  meses: string[],
): SerieSecciones {
  const serie = serieVacia(meses);
  const centro = centroDe(mesesBase);
  const g = 1 + supuestos.crecimientoMensual / 100;
  const inf = 1 + supuestos.inflacionAnual / 100;
  for (const m of meses) {
    const t = indiceMes(m) - centro;
    const ingresos = ingresosBase * g ** t;
    serie.ingresos[m] = redondear(ingresos);
    serie.costo_ventas[m] = redondear(ingresos * (1 - supuestos.margenBruto / 100));
    for (const s of SECCIONES_GASTO) {
      const { modo, valor } = supuestos.gastos[s];
      serie[s][m] = redondear(modo === "pct" ? (ingresos * valor) / 100 : valor * inf ** (t / 12));
    }
  }
  return serie;
}

export interface LineaPresupuesto {
  escenario: Escenario;
  periodo: string;
  /** null = consolidado. */
  unidad_id: string | null;
  seccion: Seccion;
  /** El tipo de gasto (`fin_tipos`); null = «Otros de <sección>» (o la sección entera en un presupuesto sin tipos). */
  tipo_id: string | null;
  monto: number;
}

/**
 * Reparte un monto entre tiendas según su parte en los meses base. Redondea a centavos y deja la diferencia del
 * redondeo en la parte más grande, para que la suma dé exacto. Sin base (todo cero), queda en el consolidado (null).
 */
export function repartir(monto: number, pesos: Map<string, number>): Map<string | null, number> {
  const total = [...pesos.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string | null, number>();
  if (Math.abs(total) < 0.005) {
    out.set(null, redondear(monto));
    return out;
  }
  let mayor: string | null = null;
  let asignado = 0;
  for (const [u, p] of pesos) {
    if (p === 0) continue;
    const v = redondear((monto * p) / total);
    out.set(u, v);
    asignado += v;
    if (mayor === null || Math.abs(p) > Math.abs(pesos.get(mayor)!)) mayor = u;
  }
  if (mayor !== null) out.set(mayor, redondear(out.get(mayor)! + monto - asignado));
  return out;
}

/**
 * Las líneas de los tres escenarios del año. `realPorUnidad` es el real de los meses base de cada tienda (o unidad);
 * el consolidado es su suma. Con `porTienda`, cada sección de cada mes se reparte entre las tiendas según su parte de esa
 * sección en los meses base (`repartir`); si no, va todo al consolidado.
 */
export function generarLineas(
  supuestos: Supuestos,
  realPorUnidad: Map<string, SerieSecciones>,
  anio: number,
  porTienda: boolean,
  /** El real por tipo de los meses base: con él, cada sección se reparte entre sus tipos (`repartirEntreTipos`). */
  reales?: RealTipo[],
): LineaPresupuesto[] {
  const meses = mesesDelAnio(anio);
  const base = supuestos.mesesBase;
  const consolidado = sumarSeries([...realPorUnidad.values()], base);
  const ingresosBase = sumaEn(consolidado.ingresos, base) / (base.length || 1);
  const pesos = new Map<Seccion, Map<string, number>>(
    SECCIONES.map(({ clave }) => [clave, new Map([...realPorUnidad].map(([u, s]) => [u, sumaEn(s[clave], base)]))]),
  );
  // La depreciación (solo con el interruptor de Ajustes, migración 0917) no depende de las ventas: se presupuesta como el
  // promedio de los meses base, igual en los tres escenarios.
  const depreciacionBase = redondear(sumaEn(consolidado.depreciacion, base) / (base.length || 1));
  // Pesos de cada tipo dentro de su sección: del consolidado y, por tienda, de cada tienda.
  const pesosConsolidado = reales ? pesosPorTipo(reales, base) : null;
  const pesosUnidad = new Map<string, Map<Seccion, Map<string, number>>>();
  const pesosDe = (unidad: string | null) => {
    if (!reales) return null;
    if (unidad === null) return pesosConsolidado;
    if (!pesosUnidad.has(unidad)) pesosUnidad.set(unidad, pesosPorTipo(reales, base, unidad));
    return pesosUnidad.get(unidad)!;
  };
  const lineas: LineaPresupuesto[] = [];
  const agregar = (escenario: Escenario, periodo: string, unidad_id: string | null, seccion: Seccion, monto: number) => {
    const pesos = pesosDe(unidad_id);
    if (!pesos) {
      lineas.push({ escenario, periodo, unidad_id, seccion, tipo_id: null, monto });
      return;
    }
    for (const [tipo_id, v] of repartirEntreTipos(monto, pesos.get(seccion))) lineas.push({ escenario, periodo, unidad_id, seccion, tipo_id, monto: v });
  };
  for (const { clave: escenario } of ESCENARIOS) {
    const serie = proyectar(supuestos.escenarios[escenario], ingresosBase, base, meses);
    for (const periodo of meses) serie.depreciacion[periodo] = depreciacionBase;
    for (const { clave: seccion } of SECCIONES) {
      // Sin depreciación en el real, no se guardan líneas en cero.
      if (seccion === "depreciacion" && depreciacionBase === 0) continue;
      for (const periodo of meses) {
        const monto = serie[seccion][periodo];
        if (!porTienda) {
          agregar(escenario, periodo, null, seccion, monto);
          continue;
        }
        for (const [unidad_id, v] of repartir(monto, pesos.get(seccion)!)) agregar(escenario, periodo, unidad_id, seccion, v);
      }
    }
  }
  return lineas;
}

/** Las líneas guardadas de un escenario como serie: de una tienda, o de todas con `unidad = undefined`. */
export function serieDeLineas(
  lineas: { escenario: string; periodo: string; unidad_id: string | null; seccion: string; monto: number }[],
  escenario: Escenario,
  meses: string[],
  unidad?: string | null,
): SerieSecciones {
  const serie = serieVacia(meses);
  for (const l of lineas) {
    if (l.escenario !== escenario || !esSeccion(l.seccion)) continue;
    if (unidad !== undefined && l.unidad_id !== unidad) continue;
    if (serie[l.seccion][l.periodo] === undefined) continue;
    serie[l.seccion][l.periodo] = redondear(serie[l.seccion][l.periodo] + l.monto);
  }
  return serie;
}

/**
 * Cambia el total anual de una sección y lo reparte entre los meses en la misma proporción que tenían. Si todos eran
 * cero, en partes iguales. La diferencia del redondeo va al último mes.
 */
export function repartirTotal(actuales: PorMes, meses: string[], nuevo: number): PorMes {
  const total = sumaEn(actuales, meses);
  const out: PorMes = {};
  let asignado = 0;
  meses.forEach((m, i) => {
    const v = i === meses.length - 1 ? redondear(nuevo - asignado) : redondear(Math.abs(total) < 0.005 ? nuevo / meses.length : (nuevo * (actuales[m] ?? 0)) / total);
    out[m] = v;
    asignado += v;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Detalle por tipo de gasto
// ---------------------------------------------------------------------------------------------------------------------

/** El real de un tipo (`fin_tipos`) en un mes y una unidad, como se lee en su sección (ver `valorEnSeccion`). */
export interface RealTipo {
  unidad_id: string;
  tipo_id: string;
  seccion: Seccion;
  periodo: string;
  valor: number;
}

/** Un tipo entra con su propia línea si pesa al menos esto (en %) dentro de su sección en los meses base. */
export const UMBRAL_TIPO = 1;

/** Los retiros de dividendos (en «Otros») no son un gasto del negocio y no se presupuestan. */
export const esDividendo = (nombreTipo: string) => /dividendo/i.test(nombreTipo);

/**
 * Un monto del libro (positivo, con el `signo` del tipo) como se lee en su sección: en ingresos, las ventas suman y las
 * devoluciones restan; en costos y gastos, lo gastado en positivo y un reverso en negativo.
 */
export const valorEnSeccion = (seccion: Seccion, signo: number, monto: number) => monto * signo * SIGNO_SECCION[seccion];

/** Lo que pesó cada tipo dentro de su sección en los meses dados: de una unidad, o de todas con `unidad` vacía. */
export function pesosPorTipo(reales: RealTipo[], meses: string[], unidad?: string): Map<Seccion, Map<string, number>> {
  const enMeses = new Set(meses);
  const out = new Map<Seccion, Map<string, number>>();
  for (const r of reales) {
    if (!enMeses.has(r.periodo) || (unidad !== undefined && r.unidad_id !== unidad)) continue;
    const tipos = out.get(r.seccion) ?? new Map<string, number>();
    tipos.set(r.tipo_id, (tipos.get(r.tipo_id) ?? 0) + r.valor);
    out.set(r.seccion, tipos);
  }
  return out;
}

/** La clave interna de «Otros de <sección>» dentro de `repartir` (afuera es null). */
const OTROS = "";

/**
 * Reparte el monto de una sección entre sus tipos según su peso: los que pesan al menos `umbral` % de la sección llevan
 * su parte y el resto va a «Otros de <sección>» (clave null). Sin pesos (o si suman cero), todo a «Otros». Redondea a
 * centavos y la suma da exacto.
 */
export function repartirEntreTipos(monto: number, pesos: Map<string, number> | undefined, umbral = UMBRAL_TIPO): Map<string | null, number> {
  const total = pesos ? [...pesos.values()].reduce((a, b) => a + b, 0) : 0;
  if (!pesos || Math.abs(total) < 0.005) return new Map([[null, redondear(monto)]]);
  const propios = new Map<string, number>();
  let resto = total;
  for (const [tipo, p] of pesos) {
    if ((Math.abs(p) / Math.abs(total)) * 100 < umbral) continue;
    propios.set(tipo, p);
    resto -= p;
  }
  if (Math.abs(resto) >= 0.005) propios.set(OTROS, resto);
  return new Map([...repartir(monto, propios)].map(([k, v]) => [k === OTROS ? null : k, v]));
}

/**
 * Cambia el total de varias líneas (los tipos de una sección en un mes) y lo reparte en la misma proporción que tenían.
 * Si sumaban cero, todo va a «Otros» (null). Es lo que pasa al editar la celda de una sección.
 */
export function repartirProporcional(actuales: Map<string | null, number>, nuevo: number): Map<string | null, number> {
  const pesos = new Map([...actuales].map(([k, v]) => [k ?? OTROS, v]));
  const total = [...pesos.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string | null, number>([...actuales.keys()].map((k) => [k, 0]));
  if (Math.abs(total) < 0.005) {
    out.set(null, redondear(nuevo));
    return out;
  }
  for (const [k, v] of repartir(nuevo, pesos)) out.set(k === OTROS ? null : k, v);
  return out;
}

/** Un tipo de una sección del presupuesto, mes a mes. `tipo_id` null = «Otros de <sección>». */
export interface FilaTipo {
  tipo_id: string | null;
  meses: PorMes;
}

export type DetalleSecciones = Record<Seccion, FilaTipo[]>;

const totalFila = (f: FilaTipo) => Object.values(f.meses).reduce((a, b) => a + b, 0);

/** Del tipo más grande al más chico, y «Otros» al final. */
const ordenarTipos = (filas: FilaTipo[]) =>
  filas.sort((a, b) => Number(a.tipo_id === null) - Number(b.tipo_id === null) || Math.abs(totalFila(b)) - Math.abs(totalFila(a)));

/**
 * Las líneas guardadas de un escenario por sección y tipo: de una tienda, o de todas con `unidad = undefined`. Un
 * presupuesto creado antes del detalle por tipo tiene una sola fila por sección («Otros», tipo null).
 */
export function detalleDeLineas(
  lineas: { escenario: string; periodo: string; unidad_id: string | null; seccion: string; tipo_id?: string | null; monto: number }[],
  escenario: Escenario,
  meses: string[],
  unidad?: string | null,
): DetalleSecciones {
  const enMeses = new Set(meses);
  const porSeccion = new Map<Seccion, Map<string | null, PorMes>>();
  for (const l of lineas) {
    if (l.escenario !== escenario || !esSeccion(l.seccion) || !enMeses.has(l.periodo)) continue;
    if (unidad !== undefined && l.unidad_id !== unidad) continue;
    const tipos = porSeccion.get(l.seccion) ?? new Map<string | null, PorMes>();
    const tipo = l.tipo_id ?? null;
    const fila = tipos.get(tipo) ?? Object.fromEntries(meses.map((m) => [m, 0]));
    fila[l.periodo] = redondear(fila[l.periodo] + l.monto);
    tipos.set(tipo, fila);
    porSeccion.set(l.seccion, tipos);
  }
  return Object.fromEntries(
    SECCIONES.map(({ clave }) => [
      clave,
      ordenarTipos([...(porSeccion.get(clave) ?? new Map<string | null, PorMes>())].map(([tipo_id, m]) => ({ tipo_id, meses: m }))),
    ]),
  ) as DetalleSecciones;
}

/** La serie por sección que suma un detalle por tipo. */
export function serieDeDetalle(detalle: DetalleSecciones, meses: string[]): SerieSecciones {
  const serie = serieVacia(meses);
  for (const { clave } of SECCIONES) {
    for (const f of detalle[clave] ?? []) for (const m of meses) serie[clave][m] = redondear(serie[clave][m] + (f.meses[m] ?? 0));
  }
  return serie;
}

/**
 * Una sección después de editar una celda (la usan la acción del servidor y la tabla, para verse al instante):
 * - un tipo (`tipo` = id, o null para «Otros») en un mes: ese monto; en el total del año (`mes` null): se reparte entre
 *   sus meses en la proporción que tenían (`repartirTotal`);
 * - la sección (`tipo` undefined) en un mes: se reparte entre sus tipos en la proporción que tenían ese mes
 *   (`repartirProporcional`); en el total del año: primero entre los meses y luego, cada mes, entre sus tipos.
 * Una sección sin líneas gana la fila «Otros». No cambia `filas`.
 */
export function editarSeccion(filas: FilaTipo[], meses: string[], tipo: string | null | undefined, mes: string | null, nuevo: number): FilaTipo[] {
  const out = filas.map((f) => ({ tipo_id: f.tipo_id, meses: { ...f.meses } }));
  const fila = (t: string | null) => {
    let f = out.find((x) => x.tipo_id === t);
    if (!f) {
      f = { tipo_id: t, meses: Object.fromEntries(meses.map((m) => [m, 0])) };
      out.push(f);
    }
    return f;
  };
  if (tipo !== undefined) {
    const f = fila(tipo);
    if (mes) f.meses[mes] = redondear(nuevo);
    else f.meses = repartirTotal(f.meses, meses, nuevo);
    return out;
  }
  if (!out.length) fila(null);
  const repartirMes = (m: string, valor: number) => {
    const nuevos = repartirProporcional(new Map(out.map((f) => [f.tipo_id, f.meses[m] ?? 0])), valor);
    for (const [t, v] of nuevos) fila(t).meses[m] = v;
  };
  if (mes) {
    repartirMes(mes, nuevo);
    return out;
  }
  const seccion: PorMes = Object.fromEntries(meses.map((m) => [m, out.reduce((a, f) => a + (f.meses[m] ?? 0), 0)]));
  const porMes = repartirTotal(seccion, meses, nuevo);
  for (const m of meses) repartirMes(m, porMes[m]);
  return out;
}

/** Las celdas (tipo y mes) que cambiaron de `antes` a `despues`. */
export function celdasCambiadas(antes: FilaTipo[], despues: FilaTipo[], meses: string[]): { tipo_id: string | null; periodo: string; monto: number }[] {
  const out: { tipo_id: string | null; periodo: string; monto: number }[] = [];
  for (const f of despues) {
    const previa = antes.find((x) => x.tipo_id === f.tipo_id);
    for (const m of meses) {
      const v = redondear(f.meses[m] ?? 0);
      if (!previa || Math.abs(v - (previa.meses[m] ?? 0)) >= 0.005) out.push({ tipo_id: f.tipo_id, periodo: m, monto: v });
    }
  }
  return out;
}

/** ¿La sección tiene detalle por tipo (algún tipo propio, no solo «Otros»)? */
export const tieneTipos = (filas: FilaTipo[] | undefined) => !!filas?.some((f) => f.tipo_id !== null);

export interface ComparacionTipo {
  tipo_id: string | null;
  meses: Record<string, Comparacion>;
  acumulado: Comparacion;
}

/**
 * Presupuesto vs real por tipo, en las secciones con detalle. Un tipo del real sin línea propia en el presupuesto suma
 * en «Otros de <sección>», como se presupuestó. `reales` ya viene filtrado por la tienda que se ve.
 */
export function compararPorTipo(ppto: DetalleSecciones, reales: RealTipo[], mesesReales: string[]): Partial<Record<Seccion, ComparacionTipo[]>> {
  const out: Partial<Record<Seccion, ComparacionTipo[]>> = {};
  const enMeses = new Set(mesesReales);
  for (const { clave } of SECCIONES) {
    const filas = ppto[clave];
    if (!tieneTipos(filas)) continue;
    const propios = new Set(filas.map((f) => f.tipo_id).filter((t): t is string => t !== null));
    const real = new Map<string | null, PorMes>();
    for (const r of reales) {
      if (r.seccion !== clave || !enMeses.has(r.periodo)) continue;
      const k = propios.has(r.tipo_id) ? r.tipo_id : null;
      const m = real.get(k) ?? {};
      m[r.periodo] = (m[r.periodo] ?? 0) + r.valor;
      real.set(k, m);
    }
    const tipos: (string | null)[] = [...filas.map((f) => f.tipo_id).filter((t) => t !== null)];
    if (filas.some((f) => f.tipo_id === null) || real.has(null)) tipos.push(null);
    out[clave] = tipos.map((tipo_id) => {
      const p = filas.find((f) => f.tipo_id === tipo_id)?.meses ?? {};
      const r = real.get(tipo_id) ?? {};
      return {
        tipo_id,
        meses: Object.fromEntries(mesesReales.map((m) => [m, comparar(clave, redondear(r[m] ?? 0), p[m] ?? 0)])),
        acumulado: comparar(clave, redondear(sumaEn(r, mesesReales)), redondear(sumaEn(p, mesesReales))),
      };
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Presupuesto vs real
// ---------------------------------------------------------------------------------------------------------------------

export type ConceptoComparado = Seccion | "margen_bruto" | "ebitda" | "resultado";

/** Las filas de la comparación, en el orden del EERR, con los resultados intermedios. */
export const CONCEPTOS: { clave: ConceptoComparado; etiqueta: string; resultado?: boolean }[] = [
  { clave: "ingresos", etiqueta: "Ingresos netos" },
  { clave: "costo_ventas", etiqueta: "Costo de ventas" },
  { clave: "margen_bruto", etiqueta: "Margen bruto", resultado: true },
  { clave: "administracion", etiqueta: "Administración / operación" },
  { clave: "marketing", etiqueta: "Marketing" },
  { clave: "ebitda", etiqueta: "EBITDA", resultado: true },
  { clave: "depreciacion", etiqueta: "Depreciación" },
  { clave: "finanzas", etiqueta: "Finanzas" },
  { clave: "otros", etiqueta: "Otros (sin dividendos)" },
  { clave: "impuesto_ganancias", etiqueta: "Impuesto a las ganancias" },
  { clave: "resultado", etiqueta: "Resultado neto (sin dividendos)", resultado: true },
];

/** Más es mejor en ingresos y resultados; menos es mejor en costos y gastos. */
export const masEsMejor = (c: ConceptoComparado) => c === "ingresos" || c === "margen_bruto" || c === "ebitda" || c === "resultado";

/** Los valores de cada concepto por mes. */
export function valoresPorConcepto(serie: SerieSecciones, meses: string[]): Record<ConceptoComparado, PorMes> {
  const d = derivados(serie, meses);
  return { ...serie, margen_bruto: d.margenBruto, ebitda: d.ebitda, resultado: d.resultado };
}

export interface Comparacion {
  real: number;
  presupuesto: number;
  /** real − presupuesto. */
  diferencia: number;
  /** Diferencia sobre el presupuesto, en %; null si el presupuesto es cero. */
  pct: number | null;
  /** null cuando no hay diferencia. */
  favorable: boolean | null;
}

export function comparar(concepto: ConceptoComparado, real: number, presupuesto: number): Comparacion {
  const diferencia = redondear(real - presupuesto);
  const pct = Math.abs(presupuesto) < 0.005 ? null : (diferencia / Math.abs(presupuesto)) * 100;
  const favorable = Math.abs(diferencia) < 0.5 ? null : masEsMejor(concepto) ? diferencia > 0 : diferencia < 0;
  return { real, presupuesto, diferencia, pct, favorable };
}

export interface FilaComparacion {
  concepto: ConceptoComparado;
  etiqueta: string;
  resultado: boolean;
  meses: Record<string, Comparacion>;
  acumulado: Comparacion;
}

/**
 * Presupuesto vs real de cada concepto en los meses con real (`mesesReales`) y el acumulado de esos meses (el YTD).
 */
export function compararConReal(presupuesto: SerieSecciones, real: SerieSecciones, mesesReales: string[]): FilaComparacion[] {
  const p = valoresPorConcepto(presupuesto, mesesReales);
  const r = valoresPorConcepto(real, mesesReales);
  // La depreciación solo se muestra si hay (interruptor de Ajustes encendido o presupuestada).
  const conceptos = CONCEPTOS.filter(
    ({ clave }) => clave !== "depreciacion" || mesesReales.some((m) => (p.depreciacion[m] ?? 0) !== 0 || (r.depreciacion[m] ?? 0) !== 0),
  );
  return conceptos.map(({ clave, etiqueta, resultado }) => ({
    concepto: clave,
    etiqueta,
    resultado: !!resultado,
    meses: Object.fromEntries(mesesReales.map((m) => [m, comparar(clave, r[clave][m] ?? 0, p[clave][m] ?? 0)])),
    acumulado: comparar(clave, sumaEn(r[clave], mesesReales), sumaEn(p[clave], mesesReales)),
  }));
}

/** Los meses del año que ya cerraron (antes del mes de `hoy`) y tienen real. */
export function mesesCerradosConReal(meses: string[], conDatos: Set<string>, hoy: string): string[] {
  const enCurso = `${hoy.slice(0, 7)}-01`;
  return meses.filter((m) => m < enCurso && conDatos.has(m));
}

// ---------------------------------------------------------------------------------------------------------------------
// Resumen de un escenario y sensibilidad
// ---------------------------------------------------------------------------------------------------------------------

export interface ResumenEscenario {
  ingresos: number;
  margenBruto: number;
  ebitda: number;
  /** null sin ingresos. */
  margenEbitda: number | null;
  valorEmpresa: number;
}

/** Los totales del año de una serie y el valor de empresa implícito (EBITDA anual × múltiplo). */
export function resumenAnual(serie: SerieSecciones, meses: string[], multiplo = MULTIPLO_EBITDA): ResumenEscenario {
  const d = derivados(serie, meses);
  const ingresos = sumaEn(d.ingresos, meses);
  const ebitda = sumaEn(d.ebitda, meses);
  return {
    ingresos,
    margenBruto: sumaEn(d.margenBruto, meses),
    ebitda,
    margenEbitda: ingresos > 0 ? (ebitda / ingresos) * 100 : null,
    valorEmpresa: valorEmpresa(ebitda, multiplo),
  };
}

export const DELTAS_INGRESOS = [-20, -10, -5, 0, 5, 10, 20];
export const DELTAS_MARGEN = [-5, -2, 0, 2, 5];

export interface BaseSensibilidad {
  ingresos: number;
  costoVentas: number;
  /** Gastos operativos (administración y marketing) que crecen con las ventas. */
  gastoVariable: number;
  /** Gastos operativos fijos: no cambian si cambian las ventas. */
  gastoFijo: number;
}

/**
 * La base de la sensibilidad desde el año presupuestado: administración y marketing son variables o fijos según su
 * modo en los supuestos del escenario (sin supuestos, variables).
 */
export function baseSensibilidad(serie: SerieSecciones, meses: string[], supuestos?: SupuestosEscenario): BaseSensibilidad {
  let gastoVariable = 0;
  let gastoFijo = 0;
  for (const s of ["administracion", "marketing"] as const) {
    const v = sumaEn(serie[s], meses);
    if ((supuestos?.gastos[s].modo ?? "pct") === "pct") gastoVariable += v;
    else gastoFijo += v;
  }
  return { ingresos: sumaEn(serie.ingresos, meses), costoVentas: sumaEn(serie.costo_ventas, meses), gastoVariable, gastoFijo };
}

export interface CeldaSensibilidad {
  deltaIngresos: number;
  deltaMargen: number;
  ebitda: number;
  valorEmpresa: number;
  margenEbitda: number | null;
}

/**
 * Cómo cambia el EBITDA anual (y el valor de empresa) si los ingresos cambian `deltaIngresos` % y el margen bruto
 * `deltaMargen` puntos. Los gastos variables siguen a los ingresos; los fijos no se mueven.
 */
export function matrizSensibilidad(
  base: BaseSensibilidad,
  deltasIngresos = DELTAS_INGRESOS,
  deltasMargen = DELTAS_MARGEN,
  multiplo = MULTIPLO_EBITDA,
): CeldaSensibilidad[][] {
  const margen = base.ingresos > 0 ? (base.ingresos - base.costoVentas) / base.ingresos : 0;
  const variable = base.ingresos > 0 ? base.gastoVariable / base.ingresos : 0;
  return deltasIngresos.map((di) =>
    deltasMargen.map((dm) => {
      const ingresos = base.ingresos * (1 + di / 100);
      const ebitda = redondear(ingresos * (margen + dm / 100) - ingresos * variable - base.gastoFijo - (base.ingresos > 0 ? 0 : base.gastoVariable));
      return {
        deltaIngresos: di,
        deltaMargen: dm,
        ebitda,
        valorEmpresa: valorEmpresa(ebitda, multiplo),
        margenEbitda: ingresos > 0 ? (ebitda / ingresos) * 100 : null,
      };
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Validación de lo que llega del navegador
// ---------------------------------------------------------------------------------------------------------------------

/** Un número del formulario («12,5» vale), dentro de un rango; null si no es número o se sale. */
export function leerNumero(v: unknown, min: number, max: number): number | null {
  const t = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Monto de una celda: hasta 100 millones, con signo (una devolución puede dejar un ingreso negativo). */
export const leerMonto = (v: unknown) => leerNumero(v, -1e8, 1e8);

/**
 * Los supuestos que llegan del formulario de generar, sobre los de por defecto (que el servidor recalcula del real).
 * Campos: `<escenario>_crecimiento`, `<escenario>_margen`, `<escenario>_inflacion`, `<escenario>_administracion`,
 * `<escenario>_marketing` y `modo_administracion` / `modo_marketing` (pct o fijo). Lo que no llega queda por defecto.
 */
export function supuestosDeFormulario(
  leer: (campo: string) => unknown,
  porDefecto: Supuestos,
): { supuestos: Supuestos } | { error: string } {
  const escenarios = {} as Record<Escenario, SupuestosEscenario>;
  for (const { clave, etiqueta } of ESCENARIOS) {
    const d = porDefecto.escenarios[clave];
    const campo = (nombre: string, min: number, max: number, defecto: number, que: string) => {
      const crudo = leer(`${clave}_${nombre}`);
      if (crudo === null || crudo === undefined || String(crudo).trim() === "") return defecto;
      const n = leerNumero(crudo, min, max);
      if (n === null) throw new Error(`${etiqueta}: ${que} va de ${min} a ${max.toLocaleString("es-PA")}.`);
      return n;
    };
    try {
      const gastos = { ...d.gastos };
      for (const s of ["administracion", "marketing"] as const) {
        const modo = gastos[s].modo;
        const max = modo === "pct" ? 100 : 1e7;
        const nombre = s === "administracion" ? "administración" : "marketing";
        gastos[s] = { modo, valor: campo(s, 0, max, gastos[s].valor, modo === "pct" ? `${nombre} (% de ingresos)` : `${nombre} (USD por mes)`) };
      }
      escenarios[clave] = {
        crecimientoMensual: campo("crecimiento", -50, 50, d.crecimientoMensual, "el crecimiento mensual"),
        margenBruto: campo("margen", -100, 100, d.margenBruto, "el margen bruto"),
        inflacionAnual: campo("inflacion", -20, 100, d.inflacionAnual, "la inflación"),
        gastos,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Supuestos inválidos." };
    }
  }
  return { supuestos: { version: 1, mesesBase: porDefecto.mesesBase, escenarios } };
}

/** El modo de un gasto que llega del formulario. */
export const leerModo = (v: unknown): SupuestoGasto["modo"] | undefined => (v === "pct" || v === "fijo" ? v : undefined);

/** Lee los supuestos guardados (jsonb); null si no tienen la forma esperada. */
export function supuestosGuardados(v: unknown): Supuestos | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<Supuestos>;
  if (s.version !== 1 || !Array.isArray(s.mesesBase) || !s.escenarios) return null;
  for (const { clave } of ESCENARIOS) {
    const e = s.escenarios[clave];
    if (!e || typeof e.crecimientoMensual !== "number" || typeof e.margenBruto !== "number" || !e.gastos) return null;
    for (const g of SECCIONES_GASTO) if (!e.gastos[g] || typeof e.gastos[g].valor !== "number") return null;
  }
  return s as Supuestos;
}

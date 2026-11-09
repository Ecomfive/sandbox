// Portal AF4 360° › Planificación › Pronóstico de ventas por tienda (mejora 9). Lógica pura: sirve en el servidor y en el
// cliente. Prueba en `pronostico.test.ts`.
//
// Método, del más completo al más simple según cuántos meses completos hay:
//  * 24 meses o más: Holt-Winters aditivo con estación de 12 meses (nivel, tendencia y estacionalidad anual).
//  * 6 a 23 meses: Holt con tendencia amortiguada (φ = 0,9). Con menos de dos años la estacionalidad anual no se puede
//    estimar (cada mes del año se vio una sola vez o ninguna): no se inventa.
//  * 4 a 5 meses: tendencia lineal (mínimos cuadrados).
//  * 1 a 3 meses: el promedio de los meses que hay.
// Las constantes de suavizado se eligen por búsqueda en una rejilla, con el menor error cuadrático a un paso.
//
// Efecto calendario: antes de pronosticar, cada mes se divide por su factor de calendario (cuántos días tiene y cuántos
// de cada día de la semana, con el peso de cada día en las ventas reales) y el pronóstico se vuelve a multiplicar por el
// factor del mes futuro. Así un mes de 31 días con cinco viernes no se confunde con crecimiento. Si los días de la semana
// casi no se diferencian (el mayor no llega a 10 % sobre el menor), solo cuenta la cantidad de días.
//
// Intervalo bajo/alto: ±1,28 desvíos de los errores a un paso (≈ 80 %), abriéndose con la raíz del horizonte.
// Backtest: para cada uno de los últimos meses (hasta 3) se ajusta el modelo solo con los meses anteriores y se pronostica
// ese mes; el MAPE es el promedio de |real − pronóstico| ÷ real.

export type MetodoPronostico = "holt_winters" | "holt" | "lineal" | "promedio" | "sin_datos";

export const ETIQUETA_METODO: Record<MetodoPronostico, string> = {
  holt_winters: "Holt-Winters aditivo (estación de 12 meses)",
  holt: "Holt con tendencia amortiguada",
  lineal: "Tendencia lineal",
  promedio: "Promedio de los meses",
  sin_datos: "Sin datos",
};

export const MESES_HOLT_WINTERS = 24;
export const MESES_HOLT = 6;
export const MESES_LINEAL = 4;
export const AMORTIGUACION = 0.9;
/** z de un intervalo central de ≈ 80 %. */
export const Z_INTERVALO = 1.28;
export const MESES_BACKTEST = 3;
/** Días de la semana: el mayor peso debe pasar al menor en este tanto para que cuente. */
export const UMBRAL_DIA_SEMANA = 1.1;
const DIAS_MES_PROMEDIO = 365.25 / 12;

export interface PuntoPronostico {
  valor: number;
  bajo: number;
  alto: number;
}

export interface ErrorBacktest {
  /** Índice del mes dentro de la serie. */
  indice: number;
  real: number;
  pronostico: number;
  /** |real − pronóstico| ÷ real (0–1); null si el real es cero. */
  error: number | null;
}

export interface Pronostico {
  metodo: MetodoPronostico;
  /** Pronóstico de los meses siguientes al último de la serie. */
  proyeccion: PuntoPronostico[];
  /** El ajuste a un paso dentro de la serie (null donde todavía no hay con qué). */
  ajuste: (number | null)[];
  backtest: ErrorBacktest[];
  /** Promedio de los errores del backtest (0–1); null sin backtest. */
  mape: number | null;
  /** Crecimiento mensual implícito entre el primer y el último mes del pronóstico (%, puede ser negativo). */
  crecimientoMensual: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------------------------------------------------

/** Día de la semana (0 = domingo) de una fecha AAAA-MM-DD, sin zona horaria. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function diasDelMes(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * Los pesos de cada día de la semana (promedio 1) desde las ventas reales por día de la semana y cuántos días de cada uno
 * hubo. Devuelve todos 1 si no hay datos o si no se diferencian (`UMBRAL_DIA_SEMANA`).
 */
export function pesosDiaSemana(ventasPorDia: number[], diasPorDia: number[]): { pesos: number[]; aplica: boolean } {
  const promedios = Array.from({ length: 7 }, (_, i) => (diasPorDia[i] > 0 ? (ventasPorDia[i] ?? 0) / diasPorDia[i] : null));
  const conDato = promedios.filter((v): v is number => v !== null);
  const media = conDato.length ? conDato.reduce((a, b) => a + b, 0) / conDato.length : 0;
  if (conDato.length < 7 || media <= 0) return { pesos: Array(7).fill(1), aplica: false };
  const pesos = promedios.map((v) => (v as number) / media);
  const min = Math.min(...pesos);
  const aplica = min > 0 && Math.max(...pesos) / min >= UMBRAL_DIA_SEMANA;
  return { pesos: aplica ? pesos : Array(7).fill(1), aplica };
}

/** Factor de calendario de un mes: Σ peso del día de cada día del mes ÷ días de un mes promedio (≈ 30,44). */
export function factorCalendario(periodo: string, pesos: number[]): number {
  const n = diasDelMes(periodo);
  const primero = diaSemana(periodo);
  let suma = 0;
  for (let d = 0; d < n; d++) suma += pesos[(primero + d) % 7] ?? 1;
  return suma / DIAS_MES_PROMEDIO;
}

// ---------------------------------------------------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------------------------------------------------

interface Ajuste {
  /** Pronóstico a h pasos (h ≥ 1) desde el final de la serie. */
  pronosticar: (h: number) => number;
  /** Ajuste a un paso dentro de la serie. */
  ajuste: (number | null)[];
}

function promedio(serie: number[]): Ajuste {
  const ajuste: (number | null)[] = serie.map((_, i) => (i === 0 ? null : serie.slice(0, i).reduce((a, b) => a + b, 0) / i));
  const media = serie.reduce((a, b) => a + b, 0) / serie.length;
  return { pronosticar: () => media, ajuste };
}

/** Recta de mínimos cuadrados (x = 0…n−1). */
export function rectaMinimosCuadrados(serie: number[]): { pendiente: number; ordenada: number } {
  const n = serie.length;
  if (n < 2) return { pendiente: 0, ordenada: serie[0] ?? 0 };
  const mx = (n - 1) / 2;
  const my = serie.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  serie.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  });
  const pendiente = sxx ? sxy / sxx : 0;
  return { pendiente, ordenada: my - pendiente * mx };
}

function lineal(serie: number[]): Ajuste {
  const { pendiente, ordenada } = rectaMinimosCuadrados(serie);
  const ajuste: (number | null)[] = serie.map((_, i) => {
    if (i < 2) return null;
    const r = rectaMinimosCuadrados(serie.slice(0, i));
    return r.ordenada + r.pendiente * i;
  });
  const n = serie.length;
  return { pronosticar: (h) => ordenada + pendiente * (n - 1 + h), ajuste };
}

const sumaAmortiguada = (phi: number, h: number) => {
  let s = 0;
  for (let k = 1; k <= h; k++) s += phi ** k;
  return s;
};

function holtCon(serie: number[], alfa: number, beta: number, phi: number): Ajuste & { sse: number } {
  let nivel = serie[0];
  let tendencia = serie.length > 1 ? serie[1] - serie[0] : 0;
  const ajuste: (number | null)[] = [null];
  let sse = 0;
  for (let t = 1; t < serie.length; t++) {
    const previsto = nivel + phi * tendencia;
    ajuste.push(previsto);
    // El primer paso usa la tendencia inicial que sale del propio dato: no se cuenta en el error.
    if (t > 1) sse += (serie[t] - previsto) ** 2;
    const nuevoNivel = alfa * serie[t] + (1 - alfa) * (nivel + phi * tendencia);
    tendencia = beta * (nuevoNivel - nivel) + (1 - beta) * phi * tendencia;
    nivel = nuevoNivel;
  }
  return { pronosticar: (h) => nivel + sumaAmortiguada(phi, h) * tendencia, ajuste, sse };
}

const ALFAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const BETAS = [0.05, 0.1, 0.2, 0.3];
const GAMAS = [0.05, 0.1, 0.2, 0.3];

function holt(serie: number[]): Ajuste {
  let mejor: (Ajuste & { sse: number }) | null = null;
  for (const a of ALFAS) for (const b of BETAS) {
    const m = holtCon(serie, a, b, AMORTIGUACION);
    if (!mejor || m.sse < mejor.sse - 1e-9) mejor = m;
  }
  return mejor!;
}

function holtWintersCon(serie: number[], s: number, alfa: number, beta: number, gama: number): Ajuste & { sse: number } {
  // Arranque: nivel = promedio del primer año; tendencia = cambio promedio entre el primer y el segundo año; estación =
  // desvío de cada mes del primer año contra su promedio.
  const primero = serie.slice(0, s);
  const segundo = serie.slice(s, 2 * s);
  const m1 = primero.reduce((a, b) => a + b, 0) / s;
  const m2 = segundo.reduce((a, b) => a + b, 0) / s;
  let nivel = m1;
  let tendencia = (m2 - m1) / s;
  const estacion = primero.map((v) => v - m1);
  const ajuste: (number | null)[] = Array(s).fill(null);
  let sse = 0;
  for (let t = s; t < serie.length; t++) {
    const e = estacion[t % s];
    const previsto = nivel + tendencia + e;
    ajuste.push(previsto);
    sse += (serie[t] - previsto) ** 2;
    const nuevoNivel = alfa * (serie[t] - e) + (1 - alfa) * (nivel + tendencia);
    tendencia = beta * (nuevoNivel - nivel) + (1 - beta) * tendencia;
    estacion[t % s] = gama * (serie[t] - nuevoNivel) + (1 - gama) * e;
    nivel = nuevoNivel;
  }
  const n = serie.length;
  return { pronosticar: (h) => nivel + h * tendencia + estacion[(n - 1 + h) % s], ajuste, sse };
}

function holtWinters(serie: number[], s = 12): Ajuste {
  let mejor: (Ajuste & { sse: number }) | null = null;
  for (const a of ALFAS) for (const b of BETAS) for (const g of GAMAS) {
    const m = holtWintersCon(serie, s, a, b, g);
    if (!mejor || m.sse < mejor.sse - 1e-9) mejor = m;
  }
  return mejor!;
}

export function metodoPara(meses: number): MetodoPronostico {
  if (meses >= MESES_HOLT_WINTERS) return "holt_winters";
  if (meses >= MESES_HOLT) return "holt";
  if (meses >= MESES_LINEAL) return "lineal";
  if (meses >= 1) return "promedio";
  return "sin_datos";
}

function ajustar(serie: number[], metodo: MetodoPronostico): Ajuste {
  if (metodo === "holt_winters") return holtWinters(serie);
  if (metodo === "holt") return holt(serie);
  if (metodo === "lineal") return lineal(serie);
  return promedio(serie);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pronóstico
// ---------------------------------------------------------------------------------------------------------------------

export interface OpcionesPronostico {
  /** Factor de calendario de cada mes de la serie y del horizonte (largo = serie + horizonte). Sin él, todos 1. */
  factores?: number[];
  /** Fuerza un método (para probar); por defecto según los meses. */
  metodo?: MetodoPronostico;
}

const desvio = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};

/**
 * El pronóstico de una serie mensual (meses completos, del más viejo al más nuevo) para los `horizonte` meses siguientes.
 * Los valores negativos del pronóstico se llevan a cero (no hay ventas negativas).
 */
export function pronosticar(serie: number[], horizonte: number, opciones: OpcionesPronostico = {}): Pronostico {
  const n = serie.length;
  const metodo = opciones.metodo ?? metodoPara(n);
  if (!n || metodo === "sin_datos") return { metodo: "sin_datos", proyeccion: [], ajuste: [], backtest: [], mape: null, crecimientoMensual: null };
  const f = opciones.factores && opciones.factores.length >= n + horizonte ? opciones.factores : Array(n + horizonte).fill(1);
  const limpia = serie.map((v, i) => v / (f[i] || 1));
  const modelo = ajustar(limpia, metodo);
  const ajuste = modelo.ajuste.map((v, i) => (v === null ? null : r2(Math.max(0, v * (f[i] || 1)))));

  // Errores a un paso de la serie ajustada (en la escala sin calendario), para el intervalo.
  const residuos = modelo.ajuste.flatMap((v, i) => (v === null ? [] : [limpia[i] - v]));
  const sigma = residuos.length >= 2 ? desvio(residuos) : Math.abs(limpia[n - 1]) * 0.2;
  const proyeccion: PuntoPronostico[] = Array.from({ length: horizonte }, (_, k) => {
    const h = k + 1;
    const factor = f[n + k] || 1;
    const centro = modelo.pronosticar(h);
    const margen = Z_INTERVALO * sigma * Math.sqrt(h);
    return { valor: r2(Math.max(0, centro * factor)), bajo: r2(Math.max(0, (centro - margen) * factor)), alto: r2(Math.max(0, (centro + margen) * factor)) };
  });

  const bt = backtest(serie, f, opciones.metodo);
  const conError = bt.filter((b) => b.error !== null);
  const mape = conError.length ? conError.reduce((a, b) => a + (b.error as number), 0) / conError.length : null;
  const p1 = proyeccion[0]?.valor ?? 0;
  const pN = proyeccion[proyeccion.length - 1]?.valor ?? 0;
  const crecimientoMensual = horizonte >= 2 && p1 > 0 && pN > 0 ? ((pN / p1) ** (1 / (horizonte - 1)) - 1) * 100 : null;
  return { metodo, proyeccion, ajuste, backtest: bt, mape, crecimientoMensual };
}

/** Para cada uno de los últimos meses: el modelo ajustado sin ese mes ni los siguientes, pronosticando ese mes. */
export function backtest(serie: number[], factores: number[], metodoFijo?: MetodoPronostico, meses = MESES_BACKTEST): ErrorBacktest[] {
  const salida: ErrorBacktest[] = [];
  const n = serie.length;
  for (let t = Math.max(1, n - meses); t < n; t++) {
    const previa = serie.slice(0, t);
    const metodo = metodoFijo ?? metodoPara(previa.length);
    // Con menos de 3 meses previos el error no dice nada del método.
    if (previa.length < 3 || metodo === "sin_datos") continue;
    const limpia = previa.map((v, i) => v / (factores[i] || 1));
    const p = Math.max(0, ajustar(limpia, metodo).pronosticar(1) * (factores[t] || 1));
    const real = serie[t];
    salida.push({ indice: t, real, pronostico: r2(p), error: real > 0 ? Math.abs(real - p) / real : null });
  }
  return salida;
}

/** Suma pronósticos de varias tiendas mes a mes (el intervalo se suma en cuadratura: los errores no se mueven juntos). */
export function sumarPronosticos(lista: PuntoPronostico[][]): PuntoPronostico[] {
  const largo = Math.max(0, ...lista.map((l) => l.length));
  return Array.from({ length: largo }, (_, k) => {
    let valor = 0;
    let varBajo = 0;
    let varAlto = 0;
    for (const l of lista) {
      const p = l[k];
      if (!p) continue;
      valor += p.valor;
      varBajo += (p.valor - p.bajo) ** 2;
      varAlto += (p.alto - p.valor) ** 2;
    }
    return { valor: r2(valor), bajo: r2(Math.max(0, valor - Math.sqrt(varBajo))), alto: r2(valor + Math.sqrt(varAlto)) };
  });
}

/** Explicación corta del método elegido (para la página). */
export function explicarMetodo(metodo: MetodoPronostico, meses: number, calendario: { diasSemana: boolean }): string {
  const base: Record<MetodoPronostico, string> = {
    holt_winters: `${meses} meses: nivel, tendencia y estacionalidad anual.`,
    holt: `${meses} meses: nivel y tendencia amortiguada. Sin estacionalidad anual (hacen falta 24 meses).`,
    lineal: `${meses} meses: recta de tendencia. Sin estacionalidad.`,
    promedio: `${meses} ${meses === 1 ? "mes" : "meses"}: promedio. Muy pocos meses para una tendencia.`,
    sin_datos: "Sin meses con ventas.",
  };
  const cal = calendario.diasSemana ? " Ajustado por días del mes y día de la semana." : " Ajustado por días del mes.";
  return metodo === "sin_datos" ? base.sin_datos : base[metodo] + cal;
}

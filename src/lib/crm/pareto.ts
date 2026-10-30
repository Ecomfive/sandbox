/**
 * El principio de Pareto (80/20) aplicado a los dropshippers y a lo que vende cada uno (31 oct 2026, pedido de Hernán para la Bandeja de Dirección).
 * Lógica pura: se prueba en pareto.test.ts.
 *
 * Qué mide: de **guías** (pedidos de Dropi sin cancelados) de los últimos meses, quién aporta cuánto. Se ordenan de más a menos y se mira cuánto va
 * sumando (el acumulado). Es un análisis **ABC**, la forma práctica del 80/20:
 *  - **A** («pocos vitales»): los que hacen falta para llegar al 80 % de las guías (el que cruza el 80 % también cuenta).
 *  - **B**: los siguientes, hasta el 95 %.
 *  - **C**: el 5 % final, la cola larga.
 * La «ley» 80/20 se cumple aquí si el 20 % de los dropshippers hace el 80 % o más de las guías (`top20`); casi nunca es exacto, por eso también
 * se dice cuántos hacen falta de verdad para el 80 % (`paraLlegarA80`). Los que no tienen guías en el periodo no entran al análisis (se cuentan aparte).
 */

export type ClasePareto = "A" | "B" | "C";

export const CLASES_PARETO: ClasePareto[] = ["A", "B", "C"];
/** Hasta qué parte del total llega cada clase. */
export const LIMITE_A = 0.8;
export const LIMITE_B = 0.95;
/** El «20 %» de la ley: la parte de los clientes que se compara con el 80 %. */
export const PARTE_TOP = 0.2;

export interface ItemPareto {
  id: string;
  valor: number;
}

export interface FilaPareto extends ItemPareto {
  /** 1 es el que más aporta. */
  posicion: number;
  /** Su parte del total (0 a 1). */
  parte: number;
  /** Lo que suman él y los de arriba (0 a 1). */
  acumulado: number;
  clase: ClasePareto;
}

export interface ResumenClase {
  /** Cuántos hay en la clase. */
  n: number;
  /** Cuánto suman (guías). */
  valor: number;
  /** Su parte de los que tienen guías (0 a 1). */
  parteDeLosItems: number;
  /** Su parte del total (0 a 1). */
  parteDelTotal: number;
}

export interface ResultadoPareto {
  total: number;
  /** Cuántos tienen guías (los que entran al análisis). */
  n: number;
  filas: FilaPareto[];
  clases: Record<ClasePareto, ResumenClase>;
  /** El 20 % de los que más aportan (redondeado hacia arriba) y lo que hacen del total. */
  top: { n: number; parteDelTotal: number };
  /** Cuántos hacen falta para llegar al 80 % y qué parte de los que tienen guías son (es la clase A). */
  paraLlegarA80: { n: number; parte: number };
  /** Si el 20 % hace el 80 % o más del total. */
  cumple8020: boolean;
}

const claseSegunAntes = (antes: number): ClasePareto => (antes < LIMITE_A - 1e-9 ? "A" : antes < LIMITE_B - 1e-9 ? "B" : "C");

/** El análisis de Pareto de una lista; los de valor 0 (o negativo) no entran. Mismo valor: se ordena por id para que el resultado no cambie. */
export function pareto(items: ItemPareto[]): ResultadoPareto {
  const con = items.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = con.reduce((s, i) => s + i.valor, 0);
  const filas: FilaPareto[] = [];
  let suma = 0;
  for (const [i, it] of con.entries()) {
    const antes = total ? suma / total : 0;
    suma += it.valor;
    filas.push({ ...it, posicion: i + 1, parte: total ? it.valor / total : 0, acumulado: total ? suma / total : 0, clase: claseSegunAntes(antes) });
  }
  const resumen = (c: ClasePareto): ResumenClase => {
    const de = filas.filter((f) => f.clase === c);
    const valor = de.reduce((s, f) => s + f.valor, 0);
    return { n: de.length, valor, parteDeLosItems: filas.length ? de.length / filas.length : 0, parteDelTotal: total ? valor / total : 0 };
  };
  const nTop = Math.ceil(filas.length * PARTE_TOP);
  const valorTop = filas.slice(0, nTop).reduce((s, f) => s + f.valor, 0);
  const a = resumen("A");
  return {
    total,
    n: filas.length,
    filas,
    clases: { A: a, B: resumen("B"), C: resumen("C") },
    top: { n: nTop, parteDelTotal: total ? valorTop / total : 0 },
    paraLlegarA80: { n: a.n, parte: a.parteDeLosItems },
    cumple8020: total > 0 && valorTop / total >= LIMITE_A - 1e-9,
  };
}

/** «14 %», «0,4 %» (con un decimal por debajo del 10 %). */
export function textoParte(parte: number): string {
  const p = parte * 100;
  if (p === 0) return "0 %";
  if (p < 10) return `${p.toLocaleString("es", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %`;
  return `${Math.round(p)} %`;
}

/** La frase que resume el análisis: «El 14 % de los dropshippers (17 de 120) hace el 80 % de las guías». */
export function fraseDelAnalisis(r: ResultadoPareto, quienes: string, que: string): string {
  if (!r.n) return `Sin ${que} en el periodo.`;
  return `El ${textoParte(r.paraLlegarA80.parte)} de ${quienes} (${r.paraLlegarA80.n} de ${r.n}) hace el ${textoParte(r.clases.A.parteDelTotal)} de ${que}.`;
}

/** Dónde está uno en el análisis (null si no tiene guías en el periodo). */
export function posicionEn(r: ResultadoPareto, id: string): FilaPareto | null {
  return r.filas.find((f) => f.id === id) ?? null;
}

/** Los últimos `n` meses (primer día de cada uno, ISO), del más viejo al actual, a partir de una fecha ISO. */
export function ultimosMeses(hoy: string, n: number): string[] {
  const [a, m] = hoy.slice(0, 7).split("-").map(Number);
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    meses.push(d.toISOString().slice(0, 10));
  }
  return meses;
}

/** Una fila de `crm_pedidos_mensuales`: las guías de un dropshipper en un mes. */
export interface PedidosMes {
  dropshipperId: string;
  /** Primer día del mes (ISO). */
  mes: string;
  pedidos: number;
}

/** Las guías de cada dropshipper mes a mes, en el orden de `meses` (0 donde no hubo). */
export function guiasPorMes(filas: PedidosMes[], meses: string[]): Map<string, number[]> {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const por = new Map<string, number[]>();
  for (const f of filas) {
    const i = indice.get(f.mes.slice(0, 10));
    if (i === undefined) continue;
    const v = por.get(f.dropshipperId) ?? new Array<number>(meses.length).fill(0);
    v[i] += f.pedidos;
    por.set(f.dropshipperId, v);
  }
  return por;
}

/** El análisis con solo los últimos `k` de los meses de las series (k ≤ largo de las series). */
export function paretoDe(porMes: Map<string, number[]>, k: number): ResultadoPareto {
  const items: ItemPareto[] = [];
  for (const [id, v] of porMes) items.push({ id, valor: v.slice(Math.max(0, v.length - k)).reduce((s, x) => s + x, 0) });
  return pareto(items);
}

/** Las guías de cada mes separadas por clase (para la gráfica de barras apiladas); la clase sale del análisis del periodo. */
export function mesesPorClase(porMes: Map<string, number[]>, r: ResultadoPareto, k: number, meses: string[]): { mes: string; A: number; B: number; C: number; sinClase: number }[] {
  const claseDe = new Map(r.filas.map((f) => [f.id, f.clase]));
  const desde = Math.max(0, meses.length - k);
  const filas = meses.slice(desde).map((mes) => ({ mes, A: 0, B: 0, C: 0, sinClase: 0 }));
  for (const [id, v] of porMes) {
    const c = claseDe.get(id);
    for (const [i, fila] of filas.entries()) fila[c ?? "sinClase"] += v[desde + i] ?? 0;
  }
  return filas;
}

/** Los productos de un dropshipper en el análisis (los que tienen pedidos), de más a menos pedidos. */
export interface ProductoPareto {
  productoId: number;
  nombre: string;
  pedidos: number;
}

/** El Pareto de los productos de un dropshipper. Los productos que se pidieron en un mismo pedido cuentan cada uno, así que la suma puede pasar de sus guías. */
export function paretoDeProductos(productos: ProductoPareto[]): ResultadoPareto & { nombres: Map<string, string> } {
  const r = pareto(productos.map((p) => ({ id: String(p.productoId), valor: p.pedidos })));
  return { ...r, nombres: new Map(productos.map((p) => [String(p.productoId), p.nombre])) };
}

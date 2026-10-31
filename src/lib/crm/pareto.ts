/**
 * El principio de Pareto (80/20) aplicado a los dropshippers y a lo que vende cada uno (31 oct 2026, pedido de Hernán para la Bandeja de Dirección).
 * Lógica pura: se prueba en pareto.test.ts.
 *
 * Qué mide: de **guías** (pedidos de Dropi sin cancelados) de los últimos meses, quién aporta cuánto. Se ordenan de más a menos y se hacen **dos grupos por
 * cantidad de clientes** (1 nov 2026, pedido de Hernán: se quitaron las clases A, B y C):
 *  - **El 20 % que más guías hace** (`top`): el 20 % de los clientes, redondeado hacia arriba.
 *  - **El 80 % restante** (`resto`): todos los demás.
 * Y se dice qué parte de las guías hace cada grupo: la «ley» 80/20 dice que el primero hace el 80 % de las guías y el segundo el 20 %. Casi nunca es exacto
 * (puede ser 64/36 o 90/10), por eso se muestra lo que hace de verdad cada grupo (`cumple8020` dice si el 20 % llega al 80 %) y, aparte, cuántos clientes hacen
 * falta de verdad para llegar al 80 % de las guías (`paraLlegarA80`). Los que no tienen guías en el periodo no entran al análisis (se cuentan aparte).
 */

/** Los dos grupos: `top` = el 20 % de los clientes que más guías hacen; `resto` = el 80 % restante. */
export type GrupoPareto = "top" | "resto";

export const GRUPOS_PARETO: GrupoPareto[] = ["top", "resto"];
/** La parte de los clientes que forma el primer grupo (el «20 %»). */
export const PARTE_TOP = 0.2;
/** La parte de las guías que dice la regla para ese grupo (el «80 %»). */
export const LIMITE_80 = 0.8;

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
  grupo: GrupoPareto;
}

export interface ResumenGrupo {
  /** Cuántos hay en el grupo. */
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
  grupos: Record<GrupoPareto, ResumenGrupo>;
  /** Cuántos hacen falta de verdad para llegar al 80 % de las guías y qué parte de los que tienen guías son. */
  paraLlegarA80: { n: number; parte: number };
  /** Si el 20 % de los clientes hace el 80 % de las guías o más. */
  cumple8020: boolean;
}

/** Cuántos forman el 20 % de `n` (redondeado hacia arriba; con alguno, al menos uno). */
export const tamanoDelTop = (n: number) => (n > 0 ? Math.ceil(n * PARTE_TOP - 1e-9) : 0);

/** El análisis de Pareto de una lista; los de valor 0 (o negativo) no entran. Mismo valor: se ordena por id para que el resultado no cambie. */
export function pareto(items: ItemPareto[]): ResultadoPareto {
  const con = items.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = con.reduce((s, i) => s + i.valor, 0);
  const nTop = tamanoDelTop(con.length);
  const filas: FilaPareto[] = [];
  let suma = 0;
  let paraLlegar = 0;
  for (const [i, it] of con.entries()) {
    const antes = total ? suma / total : 0;
    suma += it.valor;
    // El que cruza el 80 % también hace falta para llegar.
    if (antes < LIMITE_80 - 1e-9) paraLlegar = i + 1;
    filas.push({ ...it, posicion: i + 1, parte: total ? it.valor / total : 0, acumulado: total ? suma / total : 0, grupo: i < nTop ? "top" : "resto" });
  }
  const resumen = (g: GrupoPareto): ResumenGrupo => {
    const de = filas.filter((f) => f.grupo === g);
    const valor = de.reduce((s, f) => s + f.valor, 0);
    return { n: de.length, valor, parteDeLosItems: filas.length ? de.length / filas.length : 0, parteDelTotal: total ? valor / total : 0 };
  };
  const top = resumen("top");
  return {
    total,
    n: filas.length,
    filas,
    grupos: { top, resto: resumen("resto") },
    paraLlegarA80: { n: paraLlegar, parte: filas.length ? paraLlegar / filas.length : 0 },
    cumple8020: total > 0 && top.parteDelTotal >= LIMITE_80 - 1e-9,
  };
}

/** «14 %», «0,4 %» (con un decimal por debajo del 10 %). */
export function textoParte(parte: number): string {
  const p = parte * 100;
  if (p === 0) return "0 %";
  if (p < 10) return `${p.toLocaleString("es", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %`;
  return `${Math.round(p)} %`;
}

/**
 * La frase que resume el análisis: «El 20 % de los dropshippers (25 de 121) hace el 64 % de las guías; el 80 % restante (96) hace el 36 %.»
 * `quienes`: «los dropshippers»; `que`: «las guías».
 */
export function fraseDelAnalisis(r: ResultadoPareto, quienes: string, que: string): string {
  if (!r.n) return `Sin ${que} en el periodo.`;
  const { top, resto } = r.grupos;
  if (!resto.n) return `El 20 % de ${quienes} (${top.n} de ${r.n}) hace el ${textoParte(top.parteDelTotal)} de ${que}.`;
  return `El 20 % de ${quienes} (${top.n} de ${r.n}) hace el ${textoParte(top.parteDelTotal)} de ${que}; el 80 % restante (${resto.n}) hace el ${textoParte(resto.parteDelTotal)}.`;
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

/**
 * Desde qué mes hay guías en las series: el índice del primer mes (en el orden de `meses`) en que alguien tiene alguna, y cuántos meses de datos hay desde ahí
 * hasta hoy. Sirve para avisar cuando un periodo largo (6 o 12 meses) llega más atrás que los datos y por eso se parece al corto. Sin guías: `null`.
 */
export function cobertura(porMes: Map<string, number[]>, meses: string[]): { desde: string; meses: number } | null {
  let primero = -1;
  for (const v of porMes.values()) {
    const i = v.findIndex((x) => x > 0);
    if (i >= 0 && (primero < 0 || i < primero)) primero = i;
  }
  if (primero < 0 || primero >= meses.length) return null;
  return { desde: meses[primero], meses: meses.length - primero };
}

/** El análisis con solo los últimos `k` de los meses de las series (k ≤ largo de las series). */
export function paretoDe(porMes: Map<string, number[]>, k: number): ResultadoPareto {
  const items: ItemPareto[] = [];
  for (const [id, v] of porMes) items.push({ id, valor: v.slice(Math.max(0, v.length - k)).reduce((s, x) => s + x, 0) });
  return pareto(items);
}

/** Las guías de cada mes separadas por grupo (para la gráfica de barras apiladas); el grupo sale del análisis del periodo. Los que no tienen guías en el periodo no suman. */
export function mesesPorGrupo(porMes: Map<string, number[]>, r: ResultadoPareto, k: number, meses: string[]): { mes: string; top: number; resto: number }[] {
  const grupoDe = new Map(r.filas.map((f) => [f.id, f.grupo]));
  const desde = Math.max(0, meses.length - k);
  const filas = meses.slice(desde).map((mes) => ({ mes, top: 0, resto: 0 }));
  for (const [id, v] of porMes) {
    const g = grupoDe.get(id);
    if (!g) continue;
    for (const [i, fila] of filas.entries()) fila[g] += v[desde + i] ?? 0;
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

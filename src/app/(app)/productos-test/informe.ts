import type { FilaProductoTest } from "./def-productos-test";

/**
 * Lógica pura de los informes de Productos Test (sin React ni base de datos): agrupar los tests por día, semana o mes
 * y sumar lo que cada informe necesita. Las fechas son «AAAA-MM-DD» y se calculan en UTC para que no se corran de día.
 */

/**
 * Criterio con el que se decide si un test gana: **solo el CPA**, menor a $4 (confirmado por el equipo). No hay un mínimo
 * de compras. El valor no está guardado en la base; cuando haya una tabla de criterios, pasa a leerse de ahí.
 */
export const CPA_OBJETIVO = 4;

export type Granularidad = "dia" | "semana" | "mes";

/** «Ganador» agrupa lo que pasó el test: winner y también lo ya enviado a Compras. */
const ESTADOS_GANADORES = ["winner", "enviado_a_compras"];
const ESTADOS_FALLIDOS = ["fallido"];
const ESTADOS_CONSULTA = ["consulta"];

export type Resultado = "ganador" | "fallido" | "consulta" | "otro";

export function resultadoDe(estado: string): Resultado {
  if (ESTADOS_GANADORES.includes(estado)) return "ganador";
  if (ESTADOS_FALLIDOS.includes(estado)) return "fallido";
  if (ESTADOS_CONSULTA.includes(estado)) return "consulta";
  return "otro";
}

/** El test cumple el criterio: CPA menor al objetivo. Sin CPA no se puede saber (null). */
export function cumpleCriterio(f: Pick<FilaProductoTest, "metricaCpa">): boolean | null {
  return f.metricaCpa === null ? null : f.metricaCpa < CPA_OBJETIVO;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return aIso(d);
}

function lunesDe(iso: string): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return aIso(d);
}

/** «1 sep». */
export function diaMes(iso: string): string {
  const d = aFecha(iso);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}

/** Clave del periodo al que pertenece una fecha: el día, el lunes de su semana o «AAAA-MM». */
export function claveDe(iso: string, g: Granularidad): string {
  if (g === "dia") return iso.slice(0, 10);
  if (g === "semana") return lunesDe(iso);
  return iso.slice(0, 7);
}

/** Último día del periodo (para saber si todavía está en curso). */
export function finDe(clave: string, g: Granularidad): string {
  if (g === "dia") return clave;
  if (g === "semana") return sumarDias(clave, 6);
  const [anio, mes] = clave.split("-").map(Number);
  return aIso(new Date(Date.UTC(anio, mes, 0)));
}

/** Nombre del periodo: «mar 29 sep 2026», «21 sep al 27 sep», «septiembre 2026». */
export function etiquetaPeriodo(clave: string, g: Granularidad, largo: boolean): string {
  if (g === "dia") {
    const d = aFecha(clave);
    return largo ? `${DIAS_SEMANA[d.getUTCDay()]} ${diaMes(clave)} ${d.getUTCFullYear()}` : diaMes(clave);
  }
  if (g === "semana") return `${diaMes(clave)} al ${diaMes(sumarDias(clave, 6))}`;
  const [anio, mes] = clave.split("-").map(Number);
  return `${MESES_LARGOS[mes - 1]} ${anio}`;
}

/** Nombre corto bajo cada barra de la gráfica. */
export function etiquetaCorta(clave: string, g: Granularidad): string {
  if (g === "dia") return String(aFecha(clave).getUTCDate());
  if (g === "semana") return diaMes(clave);
  return MESES_CORTOS[Number(clave.split("-")[1]) - 1];
}

export interface Periodo {
  clave: string;
  filas: FilaProductoTest[];
}

/** Los tests con fecha, agrupados por periodo y en orden cronológico. Los que no tienen fecha de test no entran. */
export function agrupar(filas: FilaProductoTest[], g: Granularidad): Periodo[] {
  const porClave = new Map<string, FilaProductoTest[]>();
  for (const f of filas) {
    if (!f.fechaTest) continue;
    const k = claveDe(f.fechaTest, g);
    porClave.set(k, [...(porClave.get(k) ?? []), f]);
  }
  return [...porClave.keys()].sort().map((clave) => ({ clave, filas: porClave.get(clave)! }));
}

export interface Estadisticas {
  testeados: number;
  ganadores: number;
  fallidos: number;
  consulta: number;
  otros: number;
  gasto: number;
  compras: number;
  /** Gasto total ÷ compras totales (el CPA ponderado, no el promedio de los CPA). */
  cpa: number | null;
  /** Porcentaje de los testeados que ganaron. */
  tasa: number;
  /** Gasto total ÷ ganadores. */
  costoPorGanador: number | null;
}

export function estadisticas(filas: FilaProductoTest[]): Estadisticas {
  const por = (r: Resultado) => filas.filter((f) => resultadoDe(f.estado) === r).length;
  const gasto = filas.reduce((t, f) => t + (f.metricaGasto ?? 0), 0);
  const compras = filas.reduce((t, f) => t + (f.metricaCompras ?? 0), 0);
  const ganadores = por("ganador");
  return {
    testeados: filas.length,
    ganadores,
    fallidos: por("fallido"),
    consulta: por("consulta"),
    otros: por("otro"),
    gasto,
    compras,
    cpa: compras > 0 ? gasto / compras : null,
    tasa: filas.length ? (ganadores / filas.length) * 100 : 0,
    costoPorGanador: ganadores > 0 ? gasto / ganadores : null,
  };
}

/** Promedio de una métrica sobre las filas que la tienen (null si ninguna). */
export function promedio(filas: FilaProductoTest[], valor: (f: FilaProductoTest) => number | null): number | null {
  const v = filas.map(valor).filter((x): x is number => x !== null);
  return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
}

export interface FilaCategoria {
  categoria: string;
  testeados: number;
  ganadores: number;
}

/** Por categoría: cuántos se testearon y cuántos ganaron (la categoría vacía va como «Sin categoría»). */
export function porCategoria(filas: FilaProductoTest[]): FilaCategoria[] {
  const m = new Map<string, FilaCategoria>();
  for (const f of filas) {
    const categoria = limpiarCategoria(f.categoria);
    const o = m.get(categoria) ?? { categoria, testeados: 0, ganadores: 0 };
    o.testeados += 1;
    if (resultadoDe(f.estado) === "ganador") o.ganadores += 1;
    m.set(categoria, o);
  }
  return [...m.values()].sort((a, b) => b.testeados - a.testeados || a.categoria.localeCompare(b.categoria));
}

/** Las categorías de la hoja traen emojis («Cocina 🍳»); en los informes se muestran sin ellos. */
export function limpiarCategoria(categoria: string | null): string {
  const limpia = (categoria ?? "").replace(/[^\p{L}\p{N}/ ]/gu, "").replace(/\s+/g, " ").trim();
  return limpia || "Sin categoría";
}

/** Tests que no ganaron pero quedaron cerca del objetivo (a menos de $1 de CPA y con 3 compras o más), o en consulta. */
export function paraRevisar(filas: FilaProductoTest[]): FilaProductoTest[] {
  return filas
    .filter((f) => {
      const r = resultadoDe(f.estado);
      if (r === "consulta") return true;
      return r === "fallido" && f.metricaCpa !== null && f.metricaCpa < CPA_OBJETIVO + 1 && (f.metricaCompras ?? 0) >= 3;
    })
    .sort((a, b) => (a.metricaCpa ?? Infinity) - (b.metricaCpa ?? Infinity));
}

export const usd = (n: number, decimales = 2) =>
  `$${n.toLocaleString("es-CR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
export const porcentaje = (n: number, decimales = 1) =>
  `${n.toLocaleString("es-CR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;

/** El texto del informe, listo para pegar en WhatsApp o ClickUp. */
export function textoInforme(periodo: Periodo, g: Granularidad, codigoPais: string): string {
  const s = estadisticas(periodo.filas);
  const nombre = { dia: "Día", semana: "Semana", mes: "Mes" }[g];
  const topCategorias = porCategoria(periodo.filas)
    .filter((c) => c.ganadores > 0)
    .sort((a, b) => b.ganadores - a.ganadores)
    .slice(0, 3)
    .map((c) => `${c.categoria} (${c.ganadores} de ${c.testeados})`)
    .join(", ");
  const mejores = periodo.filas
    .filter((f) => resultadoDe(f.estado) === "ganador" && f.metricaCpa !== null)
    .sort((a, b) => (a.metricaCpa ?? 0) - (b.metricaCpa ?? 0))
    .slice(0, 3)
    .map((f) => `• ${f.nombre} — CPA ${usd(f.metricaCpa ?? 0)}, ${f.metricaCompras ?? 0} compras`)
    .join("\n");

  return [
    `Informe de testing · ${nombre} ${etiquetaPeriodo(periodo.clave, g, false)} · ${codigoPais}`,
    "",
    `Productos testeados: ${s.testeados}`,
    `Winners: ${s.ganadores} (${porcentaje(s.tasa, 0)})`,
    `En consulta: ${s.consulta}`,
    `Fallidos: ${s.fallidos}`,
    `Gasto: ${usd(s.gasto, 0)}`,
    `Compras: ${s.compras}`,
    `CPA global: ${s.cpa === null ? "—" : usd(s.cpa)} (objetivo ${usd(CPA_OBJETIVO)})`,
    `Costo por winner: ${s.costoPorGanador === null ? "—" : usd(s.costoPorGanador)}`,
    topCategorias ? `\nCategorías con winners: ${topCategorias}` : "",
    mejores ? `\nMejores:\n${mejores}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}

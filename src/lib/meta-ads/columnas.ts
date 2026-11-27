// Anuncios Meta › columnas que cada persona elige (23 nov 2026, pedido de Alcides: «no se pueden mostrar todas las métricas… agrega una sección donde se puedan personalizar», como las columnas guardadas del
// Administrador de anuncios de Meta). Un catálogo único de métricas con su texto y su color, que usan las listas de Videos, Campañas y Productos; cada lista guarda en el navegador de cada persona cuáles
// ve y en qué orden. Lógica pura, con prueba.

import { cpa, cpm, ctr, cvr, dolares, efectividad, holdRate, hookRate, nivelesDeMetricas, nivelDeResultado, nivelFrecuencia, nivelTiempo, resultado, retencion, tiempoPromedio, type Resultados } from "./metricas";
import type { NivelMetrica } from "@/lib/metricas-meta-ads";

export type ClaveColumna =
  | "gasto" | "compras" | "cpa" | "valor" | "roas" | "resultado"
  | "cpm" | "ctr" | "impresiones" | "clics"
  | "hook" | "hold" | "tiempo" | "ret25" | "ret50" | "ret75" | "ret95"
  | "efectividad" | "cvr" | "visitas"
  | "frecuencia";

export type GrupoColumna = "Resultados" | "Entrega" | "Video" | "Landing";

export interface DefColumna {
  clave: ClaveColumna;
  /** Lo que dice el encabezado. */
  titulo: string;
  grupo: GrupoColumna;
  /** Una línea para quien no sabe qué mide. */
  descripcion: string;
  /** Al ordenar, lo bajo es lo bueno (CPA, CPM, frecuencia): se ordena de menor a mayor de entrada. */
  menorEsMejor?: boolean;
}

export const CATALOGO_COLUMNAS: DefColumna[] = [
  { clave: "gasto", titulo: "Gasto", grupo: "Resultados", descripcion: "Dinero gastado en el periodo." },
  { clave: "compras", titulo: "Compras", grupo: "Resultados", descripcion: "Compras que Meta atribuye." },
  { clave: "cpa", titulo: "CPA", grupo: "Resultados", descripcion: "Costo por compra: gasto ÷ compras.", menorEsMejor: true },
  { clave: "valor", titulo: "Valor de compras", grupo: "Resultados", descripcion: "Lo vendido según Meta." },
  { clave: "roas", titulo: "ROAS", grupo: "Resultados", descripcion: "Valor de compras ÷ gasto." },
  { clave: "resultado", titulo: "Resultado estimado", grupo: "Resultados", descripcion: "Compras × CPA tope − gasto." },
  { clave: "cpm", titulo: "CPM", grupo: "Entrega", descripcion: "Costo por mil impresiones.", menorEsMejor: true },
  { clave: "ctr", titulo: "CTR (enlace)", grupo: "Entrega", descripcion: "Clics en el enlace ÷ impresiones." },
  { clave: "impresiones", titulo: "Impresiones", grupo: "Entrega", descripcion: "Veces que se mostró." },
  { clave: "clics", titulo: "Clics al enlace", grupo: "Entrega", descripcion: "Clics en el enlace." },
  { clave: "frecuencia", titulo: "Frecuencia", grupo: "Entrega", descripcion: "Veces que una persona lo vio, últimos 7 días (solo campañas y anuncios).", menorEsMejor: true },
  { clave: "hook", titulo: "Hook (3 s)", grupo: "Video", descripcion: "Reproducciones de 3 s ÷ impresiones." },
  { clave: "hold", titulo: "Pasan 15 s", grupo: "Video", descripcion: "De los que vieron 3 s, cuántos pasan los 15 s." },
  { clave: "tiempo", titulo: "Tiempo prom.", grupo: "Video", descripcion: "Segundos que se mira cada reproducción." },
  { clave: "ret25", titulo: "Ven el 25 %", grupo: "Video", descripcion: "De los que vieron 3 s, cuántos llegan al 25 % del video." },
  { clave: "ret50", titulo: "Ven el 50 %", grupo: "Video", descripcion: "De los que vieron 3 s, cuántos llegan al 50 %." },
  { clave: "ret75", titulo: "Ven el 75 %", grupo: "Video", descripcion: "De los que vieron 3 s, cuántos llegan al 75 %." },
  { clave: "ret95", titulo: "Ven el 95 %", grupo: "Video", descripcion: "De los que vieron 3 s, cuántos llegan al 95 %." },
  { clave: "efectividad", titulo: "% Efectividad", grupo: "Landing", descripcion: "Visitas a la landing ÷ clics al enlace." },
  { clave: "visitas", titulo: "Visitas a la landing", grupo: "Landing", descripcion: "Vistas de la página de destino." },
  { clave: "cvr", titulo: "CVR", grupo: "Landing", descripcion: "Compras ÷ visitas a la landing." },
];

export const GRUPOS_COLUMNA: GrupoColumna[] = ["Resultados", "Entrega", "Video", "Landing"];
const DE = new Map(CATALOGO_COLUMNAS.map((c) => [c.clave, c]));
export const defDeColumna = (clave: ClaveColumna): DefColumna => DE.get(clave)!;
export const esClaveColumna = (v: unknown): v is ClaveColumna => typeof v === "string" && DE.has(v as ClaveColumna);

/** Conjuntos listos: el de la hoja de Control de Testing, el «kpi» de Meta (la captura del Administrador de anuncios), el básico de Videos y todas. */
export const PRESETS_COLUMNAS: { id: string; titulo: string; columnas: ClaveColumna[] }[] = [
  { id: "testing", titulo: "Control de Testing", columnas: ["cpm", "efectividad", "hook", "ctr", "cpa", "gasto", "compras", "cvr", "resultado"] },
  { id: "meta", titulo: "Como en Meta (kpi)", columnas: ["gasto", "compras", "cpa", "ctr", "cpm", "frecuencia", "valor", "roas", "tiempo"] },
  { id: "basico", titulo: "Básico", columnas: ["gasto", "compras", "cpa", "hook", "hold", "ctr", "resultado"] },
  { id: "todas", titulo: "Todas", columnas: CATALOGO_COLUMNAS.map((c) => c.clave) },
];

/** Lo que se necesita de una fila para pintar una columna. */
export interface ContextoColumna {
  tope: number;
  etapa: string | null;
  /** Frecuencia de los últimos 7 días, si la fila la tiene (campañas y anuncios). */
  frecuencia?: number | null;
  /** Con poca data los colores se apagan (una cifra con $20 no dice nada). */
  confiable?: boolean;
}

const pct = (n: number | null, d = 1) => (n === null ? "—" : `${n.toFixed(d)} %`);
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const ret = (r: Resultados, k: "p25" | "p50" | "p75" | "p95") => retencion(r)?.[k] ?? null;

/** El texto y el color de una columna para unos resultados. «—» cuando no hay dato (nunca un cero que parezca real). */
export function valorColumna(clave: ClaveColumna, r: Resultados, ctx: ContextoColumna): { texto: string; nivel: NivelMetrica } {
  const niveles = nivelesDeMetricas(r, ctx.etapa, ctx.tope);
  const color = (n: NivelMetrica): NivelMetrica => (ctx.confiable === false ? "neutral" : n);
  const sin = { texto: "—", nivel: "neutral" as NivelMetrica };
  switch (clave) {
    case "gasto":
      return { texto: r.gasto > 0 ? dolares(r.gasto) : "—", nivel: niveles.gasto };
    case "compras":
      return { texto: r.gasto > 0 || r.compras > 0 ? entero(r.compras) : "—", nivel: "neutral" };
    case "cpa":
      return { texto: cpa(r) !== null ? dolares(cpa(r)!) : r.gasto > 0 ? "Sin compras" : "—", nivel: color(niveles.cpa) };
    case "valor":
      return { texto: r.valor > 0 ? dolares(r.valor) : "—", nivel: "neutral" };
    case "roas":
      return { texto: r.gasto > 0 && r.valor > 0 ? `${(r.valor / r.gasto).toFixed(2)}x` : "—", nivel: "neutral" };
    case "resultado":
      return r.gasto === 0 ? sin : { texto: `${resultado(r, ctx.tope) < 0 ? "−" : "+"}${dolares(Math.abs(resultado(r, ctx.tope)))}`, nivel: color(nivelDeResultado(resultado(r, ctx.tope))) };
    case "cpm":
      return { texto: cpm(r) === null ? "—" : dolares(cpm(r)!), nivel: color(niveles.cpm) };
    case "ctr":
      return { texto: pct(ctr(r), 2), nivel: color(niveles.ctr) };
    case "impresiones":
      return { texto: r.impresiones > 0 ? entero(r.impresiones) : "—", nivel: "neutral" };
    case "clics":
      return { texto: r.clics > 0 ? entero(r.clics) : "—", nivel: "neutral" };
    case "frecuencia":
      return ctx.frecuencia == null ? sin : { texto: ctx.frecuencia.toFixed(2), nivel: nivelFrecuencia(ctx.frecuencia) };
    case "hook":
      return { texto: pct(hookRate(r), 0), nivel: color(niveles.hook) };
    case "hold":
      return { texto: pct(holdRate(r), 0), nivel: "neutral" };
    case "tiempo":
      return tiempoPromedio(r) === null ? sin : { texto: `${tiempoPromedio(r)!.toFixed(1)} s`, nivel: nivelTiempo(tiempoPromedio(r)) };
    case "ret25":
      return { texto: pct(ret(r, "p25"), 0), nivel: "neutral" };
    case "ret50":
      return { texto: pct(ret(r, "p50"), 0), nivel: "neutral" };
    case "ret75":
      return { texto: pct(ret(r, "p75"), 0), nivel: "neutral" };
    case "ret95":
      return { texto: pct(ret(r, "p95"), 0), nivel: "neutral" };
    case "efectividad":
      return { texto: pct(efectividad(r), 1), nivel: color(niveles.efectividad) };
    case "visitas":
      return { texto: r.vioLanding > 0 ? entero(r.vioLanding) : "—", nivel: "neutral" };
    case "cvr":
      return { texto: pct(cvr(r), 2), nivel: color(niveles.cvr) };
  }
}

/**
 * El número por el que se ordena una columna (`orden.ts`); null cuando no hay dato (nunca un cero que parezca real). Una columna nueva del catálogo tiene que sumar aquí su número: si falta, TypeScript no deja compilar.
 */
export function numeroColumna(clave: ClaveColumna, r: Resultados, ctx: ContextoColumna): number | null {
  switch (clave) {
    case "gasto":
      return r.gasto > 0 ? r.gasto : null;
    case "compras":
      return r.gasto > 0 || r.compras > 0 ? r.compras : null;
    case "cpa":
      return cpa(r);
    case "valor":
      return r.valor > 0 ? r.valor : null;
    case "roas":
      return r.gasto > 0 && r.valor > 0 ? r.valor / r.gasto : null;
    case "resultado":
      return r.gasto > 0 ? resultado(r, ctx.tope) : null;
    case "cpm":
      return cpm(r);
    case "ctr":
      return ctr(r);
    case "impresiones":
      return r.impresiones > 0 ? r.impresiones : null;
    case "clics":
      return r.clics > 0 ? r.clics : null;
    case "frecuencia":
      return ctx.frecuencia ?? null;
    case "hook":
      return hookRate(r);
    case "hold":
      return holdRate(r);
    case "tiempo":
      return tiempoPromedio(r);
    case "ret25":
      return ret(r, "p25");
    case "ret50":
      return ret(r, "p50");
    case "ret75":
      return ret(r, "p75");
    case "ret95":
      return ret(r, "p95");
    case "efectividad":
      return efectividad(r);
    case "visitas":
      return r.vioLanding > 0 ? r.vioLanding : null;
    case "cvr":
      return cvr(r);
  }
}

/** Lo que se guardó en el navegador, validado: solo claves que existen, sin repetir y en su orden; si no queda nada, lo de por defecto. */
export function columnasValidas(guardado: unknown, porDefecto: ClaveColumna[]): ClaveColumna[] {
  if (!Array.isArray(guardado)) return porDefecto;
  const vistas = new Set<ClaveColumna>();
  for (const v of guardado) if (esClaveColumna(v)) vistas.add(v);
  return vistas.size > 0 ? [...vistas] : porDefecto;
}

/** Mueve una columna una posición hacia arriba (-1) o hacia abajo (+1) sin salirse de la lista. */
export function moverColumna(lista: ClaveColumna[], clave: ClaveColumna, delta: -1 | 1): ClaveColumna[] {
  const i = lista.indexOf(clave);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/** Las columnas de una lista en forma de plantilla de rejilla: el nombre a lo ancho, una por métrica y la flecha. */
export const rejillaDeColumnas = (n: number, conExtra = false) => `${conExtra ? "minmax(9rem,2.4fr) minmax(5.5rem,1.2fr)" : "minmax(10rem,3fr)"} repeat(${n}, minmax(3.5rem,1fr)) 1rem`;

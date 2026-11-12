/**
 * El periodo de las páginas de Gestión de tienda (12 nov 2026, pedido de Hernán: «un sistema de fechas así», como el de Mi Reto Digital): atajos (hoy, ayer, últimos
 * 3/7/30/90/365 días, este mes, mes pasado, este año, todo) o un rango elegido en el calendario. Va en la dirección: `?periodo=<atajo>` o `?periodo=rango&desde=&hasta=`.
 * Los días son AAAA-MM-DD de Panamá y cuentan hacia atrás desde `hoy` (que en una tienda que solo tiene el Excel de Finanzas es su último día con órdenes). Sin base ni
 * React, con prueba.
 */

export type IdAtajo = "hoy" | "ayer" | "3" | "7" | "30" | "90" | "365" | "mes" | "mes-pasado" | "anio" | "todo";

export interface Atajo {
  id: IdAtajo;
  etiqueta: string;
}

/** Los atajos en el orden del menú, separados en grupos (el selector dibuja una raya entre grupos). */
export const ATAJOS: Atajo[][] = [
  [
    { id: "hoy", etiqueta: "Hoy" },
    { id: "ayer", etiqueta: "Ayer" },
  ],
  [
    { id: "3", etiqueta: "Últimos 3 días" },
    { id: "7", etiqueta: "Últimos 7 días" },
    { id: "30", etiqueta: "Últimos 30 días" },
    { id: "90", etiqueta: "Últimos 90 días" },
    { id: "365", etiqueta: "Últimos 365 días" },
  ],
  [
    { id: "mes", etiqueta: "Este mes" },
    { id: "mes-pasado", etiqueta: "Mes pasado" },
  ],
  [
    { id: "anio", etiqueta: "Este año" },
    { id: "todo", etiqueta: "Todo" },
  ],
];

const TODOS = ATAJOS.flat();
/** El periodo si no se elige ninguno. */
export const ATAJO_POR_DEFECTO: IdAtajo = "30";
/** Desde cuándo cuenta «Todo». */
export const INICIO_TODO = "2020-01-01";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Un día sumado o restado a otro (AAAA-MM-DD). */
export function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
/** Cuántos días hay de `desde` a `hasta`, contando los dos. */
export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = (ahora = new Date()) => ahora.toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** El rango de un atajo con `hoy` como último día. */
export function rangoDeAtajo(id: IdAtajo, hoy: string): { desde: string; hasta: string } {
  const mes = hoy.slice(0, 7);
  switch (id) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "mes":
      return { desde: `${mes}-01`, hasta: hoy };
    case "mes-pasado": {
      const finPasado = sumarDias(`${mes}-01`, -1);
      return { desde: `${finPasado.slice(0, 7)}-01`, hasta: finPasado };
    }
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case "todo":
      return { desde: INICIO_TODO, hasta: hoy };
    default:
      return { desde: sumarDias(hoy, -(Number(id) - 1)), hasta: hoy };
  }
}

/** Lo que dice la dirección: un atajo o un rango elegido en el calendario. */
export type EleccionPeriodo = { tipo: "atajo"; id: IdAtajo } | { tipo: "rango"; desde: string; hasta: string };

/** Lee la dirección (`periodo`, `desde`, `hasta`). Lo que no se entiende es el periodo por defecto; un rango al revés se da vuelta. */
export function leerPeriodo(periodo: unknown, desde?: unknown, hasta?: unknown): EleccionPeriodo {
  const p = Array.isArray(periodo) ? periodo[0] : periodo;
  if (p === "rango") {
    const d = Array.isArray(desde) ? desde[0] : desde;
    const h = Array.isArray(hasta) ? hasta[0] : hasta;
    if (esFecha(d) && esFecha(h)) return d <= h ? { tipo: "rango", desde: d, hasta: h } : { tipo: "rango", desde: h, hasta: d };
  }
  const atajo = TODOS.find((a) => a.id === p);
  return { tipo: "atajo", id: atajo?.id ?? ATAJO_POR_DEFECTO };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «12 nov 2026». */
export const fechaCorta = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`;
/** «12 de noviembre de 2026». */
export const fechaLarga = (dia: string) => `${Number(dia.slice(8, 10))} de ${MESES_LARGOS[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;

export interface Periodo {
  /** El atajo, o «rango». */
  id: IdAtajo | "rango";
  /** Lo que dice el botón: «Últimos 30 días», «Hoy» o «3 nov – 12 nov 2026». */
  etiqueta: string;
  desde: string;
  hasta: string;
  /** Cuántos días abarca (para comparar con el periodo anterior del mismo largo). */
  dias: number;
}

/** El periodo con sus días, contando desde `hoy`. Un rango no pasa de hoy. */
export function periodoDe(eleccion: EleccionPeriodo, hoy: string): Periodo {
  if (eleccion.tipo === "atajo") {
    const r = rangoDeAtajo(eleccion.id, hoy);
    return { id: eleccion.id, etiqueta: TODOS.find((a) => a.id === eleccion.id)!.etiqueta, ...r, dias: diasEntre(r.desde, r.hasta) };
  }
  const hasta = eleccion.hasta > hoy ? hoy : eleccion.hasta;
  const desde = eleccion.desde > hasta ? hasta : eleccion.desde;
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const etiqueta = desde === hasta ? fechaCorta(desde) : `${mismoAnio ? fechaCorta(desde).replace(/ \d{4}$/, "") : fechaCorta(desde)} – ${fechaCorta(hasta)}`;
  return { id: "rango", etiqueta, desde, hasta, dias: diasEntre(desde, hasta) };
}

/** Los parámetros de la dirección para un periodo. */
export function parametrosPeriodo(e: EleccionPeriodo): Record<string, string | null> {
  return e.tipo === "atajo" ? { periodo: e.id === ATAJO_POR_DEFECTO ? null : e.id, desde: null, hasta: null } : { periodo: "rango", desde: e.desde, hasta: e.hasta };
}

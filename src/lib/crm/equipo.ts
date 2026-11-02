/**
 * El equipo en el panel de Dirección (30 oct 2026, fase 2: medir al equipo). Junta por persona lo que ya guarda el sistema, sin cambiar
 * nada de los chats: sus respuestas en WhatsApp (`whatsapp_kpis`, por nombre de autor), los chats que tiene asignados y cuánto llevan
 * esperando, sus tareas del CRM y la cartera de dropshippers que lleva (la salud de la fase 1). Lógica pura: se prueba en equipo.test.ts.
 */

import type { AreaCrm } from "./areas";
import type { Segmento } from "./salud";

/** Meta de la primera respuesta, en minutos (la misma de «Respondidas en 15 min» de los KPIs de atención). */
export const META_RESPUESTA_MIN = 15;

export const TRAMOS_ESPERA: { hasta: number; etiqueta: string }[] = [
  { hasta: 15, etiqueta: "Menos de 15 min" },
  { hasta: 30, etiqueta: "15 a 30 min" },
  { hasta: 60, etiqueta: "30 a 60 min" },
  { hasta: 240, etiqueta: "1 a 4 h" },
  { hasta: Infinity, etiqueta: "Más de 4 h" },
];

/** En qué tramo de `TRAMOS_ESPERA` cae una espera. */
export const tramoDeEspera = (minutos: number): number => TRAMOS_ESPERA.findIndex((t) => minutos < t.hasta);

export type TonoTiempo = "exito" | "aviso" | "peligro" | "neutro";
/** Verde hasta la meta, ámbar hasta el doble, rojo después; sin dato, neutro. */
export function tonoRespuesta(minutos: number | null): TonoTiempo {
  if (minutos === null) return "neutro";
  return minutos <= META_RESPUESTA_MIN ? "exito" : minutos <= META_RESPUESTA_MIN * 2 ? "aviso" : "peligro";
}

/** «8 min», «1 h 20 min», «2 d 3 h»; «—» sin dato. */
export function duracionCorta(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return "—";
  const m = Math.round(Number(minutos));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const h = Math.round(m / 60);
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

export interface PersonaEquipo {
  id: string;
  nombre: string;
  area: AreaCrm;
}
/** Lo que devuelve `whatsapp_kpis` en `personas` (el nombre es el del autor de los mensajes). */
export interface RespuestaPersona {
  persona: string;
  enviados: number;
  respondidas: number;
  mediana_min: number | null;
  en_15_min: number;
}
export interface ChatEquipo {
  area: string;
  asignadaA: string | null;
  abierta: boolean;
  esperandoDesde: string | null;
}
export interface TareaEquipo {
  responsableId: string | null;
  estado: string;
  vence: string | null;
  hechaEn: string | null;
}
/** Un dropshipper de la cartera con quien lo lleva (nombre) y su estado de la fase 1. */
export interface ClienteEquipo {
  responsable: string | null;
  segmento: Segmento;
  pedidos30: number;
  pedidos30Antes: number;
}

export interface FilaEquipo extends PersonaEquipo {
  enviados: number;
  respondidas: number;
  medianaMin: number | null;
  en15: number;
  asignados: number;
  esperando: number;
  /** La espera más larga de sus chats ahora, en minutos (null si ninguno espera). */
  esperaMaxMin: number | null;
  tareasPendientes: number;
  tareasAtrasadas: number;
  tareasHechas: number;
  cartera: number;
  carteraActivos: number;
  carteraEnRiesgo: number;
  pedidos30: number;
  pedidos30Antes: number;
  /** Tuvo algo que medir: respuestas, chats, tareas o cartera. */
  conActividad: boolean;
}

export interface Equipo {
  filas: FilaEquipo[];
  /** Respuestas de autores que no son una persona del equipo (p. ej. «Desde el celular»). */
  otras: RespuestaPersona[];
  sinAsignar: { abiertos: number; esperando: number };
  tramos: { etiqueta: string; total: number; porArea: Partial<Record<string, number>> }[];
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Arma el equipo: una fila por persona (primero las que tienen actividad, por respuestas y luego por chats), los autores que no son del
 * equipo, los chats abiertos sin asignar y los que esperan respuesta ahora por tramo y área. `ahora` en milisegundos; `hoy` y `desde`, días
 * ISO de Panamá (las tareas hechas cuentan desde `desde`).
 */
export function armarEquipo(e: {
  personas: PersonaEquipo[];
  respuestas: RespuestaPersona[];
  chats: ChatEquipo[];
  tareas: TareaEquipo[];
  clientes: ClienteEquipo[];
  ahora: number;
  hoy: string;
  desde: string;
}): Equipo {
  const espera = (c: ChatEquipo) => (c.esperandoDesde ? Math.max(0, (e.ahora - Date.parse(c.esperandoDesde)) / 60_000) : null);
  const porNombre = new Map(e.respuestas.map((r) => [normalizar(r.persona), r]));
  const usados = new Set<string>();
  const filas = e.personas.map((p): FilaEquipo => {
    const clave = normalizar(p.nombre);
    const r = porNombre.get(clave);
    if (r) usados.add(clave);
    const suyos = e.chats.filter((c) => c.abierta && c.asignadaA === p.id);
    const esperas = suyos.map(espera).filter((m): m is number => m !== null);
    const tareas = e.tareas.filter((t) => t.responsableId === p.id);
    const cartera = e.clientes.filter((c) => c.responsable && normalizar(c.responsable) === clave);
    const fila: FilaEquipo = {
      ...p,
      enviados: Number(r?.enviados ?? 0),
      respondidas: Number(r?.respondidas ?? 0),
      medianaMin: r?.mediana_min === null || r?.mediana_min === undefined ? null : Number(r.mediana_min),
      en15: Number(r?.en_15_min ?? 0),
      asignados: suyos.length,
      esperando: esperas.length,
      esperaMaxMin: esperas.length ? Math.max(...esperas) : null,
      tareasPendientes: tareas.filter((t) => t.estado === "pendiente").length,
      tareasAtrasadas: tareas.filter((t) => t.estado === "pendiente" && !!t.vence && t.vence < e.hoy).length,
      tareasHechas: tareas.filter((t) => t.estado === "hecha" && !!t.hechaEn && t.hechaEn.slice(0, 10) >= e.desde).length,
      cartera: cartera.length,
      carteraActivos: cartera.filter((c) => c.segmento === "activo").length,
      carteraEnRiesgo: cartera.filter((c) => c.segmento === "riesgo" || c.segmento === "dormido").length,
      pedidos30: cartera.reduce((s, c) => s + c.pedidos30, 0),
      pedidos30Antes: cartera.reduce((s, c) => s + c.pedidos30Antes, 0),
      conActividad: false,
    };
    fila.conActividad = fila.enviados > 0 || fila.asignados > 0 || fila.tareasPendientes + fila.tareasHechas > 0 || fila.cartera > 0;
    return fila;
  });
  filas.sort((a, b) => Number(b.conActividad) - Number(a.conActividad) || b.respondidas - a.respondidas || b.asignados - a.asignados || a.nombre.localeCompare(b.nombre, "es"));

  const abiertos = e.chats.filter((c) => c.abierta);
  const tramos = TRAMOS_ESPERA.map((t) => ({ etiqueta: t.etiqueta, total: 0, porArea: {} as Partial<Record<string, number>> }));
  for (const c of abiertos) {
    const m = espera(c);
    if (m === null) continue;
    const t = tramos[tramoDeEspera(m)];
    t.total++;
    t.porArea[c.area] = (t.porArea[c.area] ?? 0) + 1;
  }
  const sinDuenio = abiertos.filter((c) => !c.asignadaA);
  return {
    filas,
    otras: e.respuestas.filter((r) => !usados.has(normalizar(r.persona))),
    sinAsignar: { abiertos: sinDuenio.length, esperando: sinDuenio.filter((c) => c.esperandoDesde).length },
    tramos,
  };
}

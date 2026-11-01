// Equipo › Tareas (31 oct 2026, pedido de Alcides; migración 0215): las reglas de una tarea del equipo, como en su lista «Lideres Empresas» de
// ClickUp. Sin base ni React, para probarlas.

export const ESTADOS_TAREA = [
  { valor: "backlog", etiqueta: "Backlog", color: "#8b8d98" },
  { valor: "pendiente", etiqueta: "Pendiente", color: "#f76808" },
  { valor: "en_progreso", etiqueta: "En progreso", color: "#d9a200" },
  { valor: "en_revision", etiqueta: "En revisión", color: "#e5484d" },
  { valor: "aprobado", etiqueta: "Aprobado", color: "#0090ff" },
  { valor: "rechazado", etiqueta: "Rechazado", color: "#8e4ec6" },
  { valor: "hecho", etiqueta: "Hecho", color: "#30a46c" },
  { valor: "archivado", etiqueta: "Archivado", color: "#5b5bd6" },
] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number]["valor"];

export const PRIORIDADES_TAREA = [
  { valor: "urgente", etiqueta: "Urgente", color: "#e5484d" },
  { valor: "alta", etiqueta: "Alta", color: "#d9a200" },
  { valor: "normal", etiqueta: "Normal", color: "#0090ff" },
  { valor: "baja", etiqueta: "Baja", color: "#8b8d98" },
] as const;
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number]["valor"];

export const MAX_TITULO = 200;
export const MAX_DESCRIPCION = 5000;

export const etiquetaEstado = (e: string) => ESTADOS_TAREA.find((x) => x.valor === e)?.etiqueta ?? e;
export const colorEstado = (e: string) => ESTADOS_TAREA.find((x) => x.valor === e)?.color ?? "#8b8d98";
export const etiquetaPrioridad = (p: string | null) => PRIORIDADES_TAREA.find((x) => x.valor === p)?.etiqueta ?? "Sin prioridad";
export const colorPrioridad = (p: string | null) => PRIORIDADES_TAREA.find((x) => x.valor === p)?.color ?? "#8b8d98";
export const esEstado = (v: unknown): v is EstadoTarea => ESTADOS_TAREA.some((e) => e.valor === v);
export const esPrioridad = (v: unknown): v is PrioridadTarea => PRIORIDADES_TAREA.some((p) => p.valor === v);

/** «TAR-0007». */
export const numeroTarea = (n: number) => `TAR-${String(n).padStart(4, "0")}`;

/** Una tarea cerrada (no va al tablero ni cuenta como pendiente): hecha o archivada. */
export const cerrada = (estado: string) => estado === "hecho" || estado === "archivado";

/** Atrasada: abierta, con fecha límite y ya pasó (`hoy` en AAAA-MM-DD). */
export const atrasada = (t: { estado: string; fechaLimite: string | null }, hoy: string) => !cerrada(t.estado) && !!t.fechaLimite && t.fechaLimite < hoy;

export interface CambioTarea {
  titulo?: string;
  descripcion?: string | null;
  estado?: EstadoTarea;
  prioridad?: PrioridadTarea | null;
  responsableId?: string | null;
  fechaInicio?: string | null;
  fechaLimite?: string | null;
  modulo?: string | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que llega del navegador, revisado: solo los datos que vienen y con su forma; un error en palabras si algo no sirve. */
export function normalizarCambio(entrada: unknown): { cambio: CambioTarea } | { error: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const c: CambioTarea = {};
  if ("titulo" in e) {
    const t = String(e.titulo ?? "").replace(/\s+/g, " ").trim();
    if (!t) return { error: "La tarea necesita un título." };
    c.titulo = t.slice(0, MAX_TITULO);
  }
  if ("descripcion" in e) {
    const d = String(e.descripcion ?? "").trim();
    c.descripcion = d ? d.slice(0, MAX_DESCRIPCION) : null;
  }
  if ("estado" in e) {
    if (!esEstado(e.estado)) return { error: "Estado no válido." };
    c.estado = e.estado;
  }
  if ("prioridad" in e) {
    if (e.prioridad !== null && e.prioridad !== "" && !esPrioridad(e.prioridad)) return { error: "Prioridad no válida." };
    c.prioridad = e.prioridad ? (e.prioridad as PrioridadTarea) : null;
  }
  if ("responsableId" in e) {
    if (e.responsableId && !UUID.test(String(e.responsableId))) return { error: "Persona no válida." };
    c.responsableId = e.responsableId ? String(e.responsableId) : null;
  }
  for (const k of ["fechaInicio", "fechaLimite"] as const) {
    if (k in e) {
      if (e[k] && !FECHA.test(String(e[k]))) return { error: "Fecha no válida." };
      c[k] = e[k] ? String(e[k]) : null;
    }
  }
  if ("modulo" in e) {
    const m = String(e.modulo ?? "").trim();
    if (m && !/^[a-z0-9-]{1,60}$/.test(m)) return { error: "Módulo no válido." };
    c.modulo = m || null;
  }
  const inicio = c.fechaInicio, limite = c.fechaLimite;
  if (inicio && limite && inicio > limite) return { error: "La fecha de inicio va antes de la fecha límite." };
  return { cambio: c };
}

/** Quién ve una tarea: un administrador, todas; los demás, las que tienen asignadas o crearon. */
export const puedeVerTarea = (t: { responsableId: string | null; creadoPor: string | null }, persona: { id: string; admin: boolean }) =>
  persona.admin || t.responsableId === persona.id || t.creadoPor === persona.id;

/**
 * Qué puede cambiar una persona: un administrador, todo; quien la tiene asignada o la creó, todo menos pasársela a otra persona (solo un
 * administrador asigna a otros: puede dejársela a sí mismo o soltarla si la creó).
 */
export function motivoNoPuede(t: { responsableId: string | null; creadoPor: string | null }, cambio: CambioTarea, persona: { id: string; admin: boolean }): string | null {
  if (persona.admin) return null;
  if (!puedeVerTarea(t, persona)) return "Esa tarea no es tuya.";
  if ("responsableId" in cambio && cambio.responsableId && cambio.responsableId !== persona.id) return "Solo un administrador asigna tareas a otras personas.";
  if ("responsableId" in cambio && !cambio.responsableId && t.creadoPor !== persona.id) return "No puedes soltar una tarea que te asignaron.";
  return null;
}

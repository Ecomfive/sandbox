// Tareas de Gestión de IDs Dropi (pedido de Alcides, 28–29 oct 2026; migraciones 0175 y 0178), como las de ClickUp: cada una con su estado (Por hacer,
// En curso, En revisión, Hecha), su prioridad, para cuándo, a quién le toca y la publicación (el producto) a la que va asociada; se archivan en vez de
// borrarse. Las que nacen de aceptar una recomendación (0128) se ven en la misma lista, solo con Por hacer y Hecha. Cada persona ve las suyas y un
// administrador las de todos. Aquí va lo puro (sin base ni React), con prueba.

export const MAX_TITULO_TAREA = 200;
export const MAX_NOTA_TAREA = 1000;
export const MAX_NOTA_CIERRE = 600;

export type OrigenTarea = "manual" | "recomendacion";
export type EstadoTarea = "por_hacer" | "en_curso" | "en_revision" | "hecha";
export type Prioridad = "urgente" | "alta" | "normal" | "baja";
/** Cómo va la fecha de una tarea sin hacer. */
export type Vencimiento = "atrasada" | "hoy" | "proxima" | "sin_fecha";

/** Los estados, en el orden de la lista, con su color (los de ClickUp: gris, azul, violeta y verde). */
export const ESTADOS_TAREA: { valor: EstadoTarea; etiqueta: string; color: string }[] = [
  { valor: "por_hacer", etiqueta: "Por hacer", color: "#8b8d98" },
  { valor: "en_curso", etiqueta: "En curso", color: "#0090ff" },
  { valor: "en_revision", etiqueta: "En revisión", color: "#8e4ec6" },
  { valor: "hecha", etiqueta: "Hecha", color: "#30a46c" },
];

export const PRIORIDADES: { valor: Prioridad; etiqueta: string; color: string }[] = [
  { valor: "urgente", etiqueta: "Urgente", color: "#e5484d" },
  { valor: "alta", etiqueta: "Alta", color: "#f76808" },
  { valor: "normal", etiqueta: "Normal", color: "#0090ff" },
  { valor: "baja", etiqueta: "Baja", color: "#8b8d98" },
];

export const VENCIMIENTOS: { valor: Vencimiento; etiqueta: string }[] = [
  { valor: "atrasada", etiqueta: "Atrasada" },
  { valor: "hoy", etiqueta: "Para hoy" },
  { valor: "proxima", etiqueta: "Próxima" },
  { valor: "sin_fecha", etiqueta: "Sin fecha" },
];

export const etiquetaEstado = (e: string) => ESTADOS_TAREA.find((x) => x.valor === e)?.etiqueta ?? e;
export const etiquetaPrioridad = (p: string | null) => PRIORIDADES.find((x) => x.valor === p)?.etiqueta ?? "Sin prioridad";

/** Una tarea de una publicación, venga de donde venga, para la pestaña «Tareas» y la ficha. */
export interface TareaVista {
  id: string;
  origen: OrigenTarea;
  publicacionId: string;
  titulo: string;
  nota: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad | null;
  responsableId: string | null;
  responsableNombre: string | null;
  /** Para cuándo (AAAA-MM-DD), o null sin fecha. */
  plazo: string | null;
  creadoPor: string | null;
  creadoPorNombre: string | null;
  creadoEn: string;
  hechaEn: string | null;
  hechaPor: string | null;
  hechaNota: string | null;
  archivadaEn: string | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esEstado = (v: unknown): v is EstadoTarea => typeof v === "string" && ESTADOS_TAREA.some((e) => e.valor === v);
export const esPrioridad = (v: unknown): v is Prioridad => typeof v === "string" && PRIORIDADES.some((p) => p.valor === v);
export const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** Cómo va la fecha de una tarea sin hacer (AAAA-MM-DD de hoy, hora de Panamá); una hecha no vence. */
export function vencimiento(t: Pick<TareaVista, "plazo" | "estado">, hoy: string): Vencimiento | null {
  if (t.estado === "hecha") return null;
  if (!t.plazo) return "sin_fecha";
  if (t.plazo < hoy) return "atrasada";
  return t.plazo === hoy ? "hoy" : "proxima";
}

/** El día siguiente (para la fecha de una tarea nueva: «mañana»). */
export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const limpio = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lo que llega del navegador para crear una tarea, revisado: título obligatorio; nota, estado, prioridad, responsable y fecha con forma válida. */
export function normalizarTarea(crudo: unknown): { titulo: string; nota: string | null; estado: EstadoTarea; prioridad: Prioridad | null; responsableId: string | null; plazo: string | null } | { error: string } {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  const titulo = limpio(o.titulo, MAX_TITULO_TAREA);
  if (!titulo) return { error: "Escribe qué hay que hacer." };
  const nota = typeof o.nota === "string" ? o.nota.trim().slice(0, MAX_NOTA_TAREA) : "";
  return {
    titulo,
    nota: nota || null,
    estado: esEstado(o.estado) ? o.estado : "por_hacer",
    prioridad: esPrioridad(o.prioridad) ? o.prioridad : null,
    responsableId: typeof o.responsableId === "string" && UUID.test(o.responsableId) ? o.responsableId : null,
    plazo: esFecha(o.plazo) ? o.plazo : null,
  };
}

/** Un cambio a una tarea (lo que se toca en su ficha o en la fila), revisado. Solo viaja lo que cambió; `null` borra (fecha, prioridad, nota). */
export interface CambioTarea {
  titulo?: string;
  nota?: string | null;
  estado?: EstadoTarea;
  prioridad?: Prioridad | null;
  responsableId?: string;
  plazo?: string | null;
  publicacionId?: string;
  archivar?: boolean;
}

export function normalizarCambio(crudo: unknown): CambioTarea | { error: string } {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  const c: CambioTarea = {};
  if ("titulo" in o) {
    const t = limpio(o.titulo, MAX_TITULO_TAREA);
    if (!t) return { error: "Escribe qué hay que hacer." };
    c.titulo = t;
  }
  if ("nota" in o) c.nota = typeof o.nota === "string" && o.nota.trim() ? o.nota.trim().slice(0, MAX_NOTA_TAREA) : null;
  if ("estado" in o) {
    if (!esEstado(o.estado)) return { error: "Estado no válido." };
    c.estado = o.estado;
  }
  if ("prioridad" in o) {
    if (o.prioridad !== null && !esPrioridad(o.prioridad)) return { error: "Prioridad no válida." };
    c.prioridad = (o.prioridad as Prioridad | null) ?? null;
  }
  if ("responsableId" in o) {
    if (typeof o.responsableId !== "string" || !UUID.test(o.responsableId)) return { error: "Persona no válida." };
    c.responsableId = o.responsableId;
  }
  if ("plazo" in o) {
    if (o.plazo !== null && !esFecha(o.plazo)) return { error: "Fecha no válida." };
    c.plazo = (o.plazo as string | null) ?? null;
  }
  if ("publicacionId" in o) {
    if (typeof o.publicacionId !== "string" || !UUID.test(o.publicacionId)) return { error: "Producto no válido." };
    c.publicacionId = o.publicacionId;
  }
  if ("archivar" in o) c.archivar = o.archivar === true;
  if (!Object.keys(c).length) return { error: "No hay nada que cambiar." };
  return c;
}

/** Por estado (en el orden de ClickUp), y dentro: atrasadas primero, luego por fecha, las sin fecha al final y, empatadas, por prioridad. */
export function ordenarTareas(tareas: TareaVista[]): TareaVista[] {
  const pe = (e: EstadoTarea) => ESTADOS_TAREA.findIndex((x) => x.valor === e);
  const pp = (p: Prioridad | null) => (p ? PRIORIDADES.findIndex((x) => x.valor === p) : PRIORIDADES.length);
  return [...tareas].sort((a, b) => {
    if (a.estado !== b.estado) return pe(a.estado) - pe(b.estado);
    if (a.estado === "hecha") return (b.hechaEn ?? "").localeCompare(a.hechaEn ?? "");
    if (a.plazo !== b.plazo) return !a.plazo ? 1 : !b.plazo ? -1 : a.plazo.localeCompare(b.plazo);
    if (a.prioridad !== b.prioridad) return pp(a.prioridad) - pp(b.prioridad);
    return a.creadoEn.localeCompare(b.creadoEn);
  });
}

/** Las tareas que ve una persona: las que le tocan a ella (o, si nadie las tiene, las que creó). Un administrador con «todas» ve todas. */
export function tareasDe(tareas: TareaVista[], yo: string, todas: boolean): TareaVista[] {
  if (todas) return tareas;
  return tareas.filter((t) => t.responsableId === yo || (!t.responsableId && t.creadoPor === yo));
}

/** Pendiente = sin hacer y sin archivar. */
export const pendiente = (t: Pick<TareaVista, "estado" | "archivadaEn">) => t.estado !== "hecha" && !t.archivadaEn;

/** La fecha de una tarea dicha en relación con hoy: «Hoy», «Mañana», «Ayer», «Hace 3 días», «En 5 días» o «12 nov». */
export function cuandoTarea(plazo: string | null, hoy: string): string {
  if (!plazo) return "Sin fecha";
  const dias = Math.round((Date.parse(`${plazo}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  if (dias < 0 && dias >= -6) return `Hace ${-dias} días`;
  if (dias > 0 && dias <= 6) return `En ${dias} días`;
  return new Date(`${plazo}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

/** Las iniciales de una persona para su círculo («Nicole Pérez» → «NP»). */
export function iniciales(nombre: string | null): string {
  const p = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}

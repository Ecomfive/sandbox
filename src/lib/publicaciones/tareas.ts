// Tareas de Gestión de IDs Dropi (pedido de Alcides, 28 oct 2026; migración 0175): las escritas a mano sobre una publicación («Mañana verificar el
// inventario de la almohada») y las que nacen de aceptar una recomendación (0128) se ven juntas en la pestaña «Tareas». Cada persona ve las suyas y un
// administrador las de todos. Aquí va lo puro (sin base ni React), con prueba.

export const MAX_TITULO_TAREA = 200;
export const MAX_NOTA_TAREA = 1000;
export const MAX_NOTA_CIERRE = 600;

export type OrigenTarea = "manual" | "recomendacion";
export type EstadoTarea = "atrasada" | "hoy" | "proxima" | "sin_fecha" | "hecha";

/** Una tarea de una publicación, venga de donde venga, para la pestaña «Tareas» y la ficha. */
export interface TareaVista {
  id: string;
  origen: OrigenTarea;
  publicacionId: string;
  titulo: string;
  nota: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  /** Para cuándo (AAAA-MM-DD), o null sin fecha. */
  plazo: string | null;
  creadoPor: string | null;
  creadoEn: string;
  hechaEn: string | null;
  hechaPor: string | null;
  hechaNota: string | null;
}

export const ESTADOS_TAREA_MANUAL: { valor: EstadoTarea; etiqueta: string }[] = [
  { valor: "atrasada", etiqueta: "Atrasadas" },
  { valor: "hoy", etiqueta: "Para hoy" },
  { valor: "proxima", etiqueta: "Próximas" },
  { valor: "sin_fecha", etiqueta: "Sin fecha" },
  { valor: "hecha", etiqueta: "Hechas" },
];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** En qué va una tarea, según su plazo y el día de hoy (AAAA-MM-DD, hora de Panamá). */
export function estadoTarea(t: Pick<TareaVista, "plazo" | "hechaEn">, hoy: string): EstadoTarea {
  if (t.hechaEn) return "hecha";
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

/** Lo que llega del navegador para crear una tarea, revisado: título obligatorio, nota opcional, responsable con forma de id y fecha válida. */
export function normalizarTarea(crudo: unknown): { titulo: string; nota: string | null; responsableId: string | null; plazo: string | null } | { error: string } {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  const titulo = limpio(o.titulo, MAX_TITULO_TAREA);
  if (!titulo) return { error: "Escribe qué hay que hacer." };
  const nota = typeof o.nota === "string" ? o.nota.trim().slice(0, MAX_NOTA_TAREA) : "";
  const responsableId = typeof o.responsableId === "string" && UUID.test(o.responsableId) ? o.responsableId : null;
  const plazo = typeof o.plazo === "string" && FECHA.test(o.plazo) && !Number.isNaN(Date.parse(`${o.plazo}T12:00:00Z`)) ? o.plazo : null;
  return { titulo, nota: nota || null, responsableId, plazo };
}

/** Las pendientes primero (atrasadas, para hoy, próximas por fecha y sin fecha), luego las hechas de la más nueva a la más vieja. */
export function ordenarTareas(tareas: TareaVista[], hoy: string): TareaVista[] {
  const orden: Record<EstadoTarea, number> = { atrasada: 0, hoy: 1, proxima: 2, sin_fecha: 3, hecha: 4 };
  return [...tareas].sort((a, b) => {
    const ea = estadoTarea(a, hoy);
    const eb = estadoTarea(b, hoy);
    if (ea !== eb) return orden[ea] - orden[eb];
    if (ea === "hecha") return (b.hechaEn ?? "").localeCompare(a.hechaEn ?? "");
    if (a.plazo && b.plazo && a.plazo !== b.plazo) return a.plazo.localeCompare(b.plazo);
    return a.creadoEn.localeCompare(b.creadoEn);
  });
}

/** Las tareas que ve una persona: las que le tocan a ella (o, si nadie las tiene, las que creó). Un administrador con «todas» ve todas. */
export function tareasDe(tareas: TareaVista[], yo: string, todas: boolean): TareaVista[] {
  if (todas) return tareas;
  return tareas.filter((t) => t.responsableId === yo || (!t.responsableId && t.creadoPor === yo));
}

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

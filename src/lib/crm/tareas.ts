// Tareas del CRM (29 oct 2026, pedido de Hernán): las que salen de un chat de WhatsApp («avísale cuando llegue el producto que pidió»,
// «llamarlo el 23 de diciembre») y los seguimientos comerciales, en la misma tabla (`tareas_dropshipper`, migración 0185). Aquí, sin
// base ni React: en qué grupo va cada una, cuándo llegó lo que se esperaba y los textos. Prueba: tareas.test.ts.

export type EstadoTarea = "pendiente" | "hecha" | "esperando";

/** Cómo se agrupan en el panel de tareas: lo atrasado y lo de hoy arriba, lo que espera una llegada aparte. */
export type GrupoTarea = "atrasada" | "hoy" | "proxima" | "sin_fecha" | "esperando" | "hecha";

export const GRUPOS_TAREA: { grupo: GrupoTarea; titulo: string }[] = [
  { grupo: "atrasada", titulo: "Atrasadas" },
  { grupo: "hoy", titulo: "Para hoy" },
  { grupo: "proxima", titulo: "Próximas" },
  { grupo: "sin_fecha", titulo: "Sin fecha" },
  { grupo: "esperando", titulo: "Esperando que llegue el producto" },
  { grupo: "hecha", titulo: "Hechas" },
];

/** El grupo de una tarea según su estado y su fecha (`hoy` y `vence` como «AAAA-MM-DD»). */
export function grupoDeTarea(t: { estado: EstadoTarea; vence: string | null }, hoy: string): GrupoTarea {
  if (t.estado === "hecha") return "hecha";
  if (t.estado === "esperando") return "esperando";
  if (!t.vence) return "sin_fecha";
  const dia = t.vence.slice(0, 10);
  return dia < hoy ? "atrasada" : dia === hoy ? "hoy" : "proxima";
}

/** Una compra de las que se esperaban, tal como sale de la base. */
export interface CompraEsperada {
  id: string;
  fechaLlegada: string | null;
  etapa: string;
}

/**
 * Si ya llegó lo que esperaba la tarea: alguna de las compras que venían en camino al crearla tiene fecha de llegada o se completó.
 * Una compra descartada o anulada no cuenta como llegada (la tarea sigue esperando las demás).
 */
export function llegoLoEsperado(esperadas: string[] | null, compras: CompraEsperada[]): boolean {
  if (!esperadas?.length) return false;
  const ids = new Set(esperadas);
  return compras.some((c) => ids.has(c.id) && (!!c.fechaLlegada || c.etapa === "completado"));
}

/** El título de la tarea de avisar una llegada. */
export const tituloAvisoLlegada = (producto: string) => `Avisarle que llegó ${producto}`.slice(0, 200);

/** El aviso de la campana cuando la tarea se activa o vence: qué hacer y con quién. */
export function textoAvisoTarea(t: { titulo: string; cliente: string | null }, motivo: "llego" | "hoy" | "asignada"): { titulo: string; texto: string } {
  const con = t.cliente ? ` · ${t.cliente}` : "";
  if (motivo === "llego") return { titulo: `Llegó lo que esperaba${con}`.slice(0, 200), texto: t.titulo };
  if (motivo === "hoy") return { titulo: `Tarea para hoy${con}`.slice(0, 200), texto: t.titulo };
  return { titulo: `Te asignaron una tarea${con}`.slice(0, 200), texto: t.titulo };
}

/** Una fecha «AAAA-MM-DD» válida (la que se escribe al crear una tarea). */
export const esFechaTarea = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

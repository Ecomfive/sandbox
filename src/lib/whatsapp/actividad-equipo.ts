// Actividad del equipo en un chat (29 oct 2026): qué hizo cada persona en la conversación con un dropshipper. Junta lo que dejó cada quien en los mensajes (respuestas, notas,
// archivos, plantillas) con lo que quedó en la auditoría (cambió el nombre, vinculó el chat, lo pasó de área, lo resolvió…). Lógica pura, con prueba.

export type ClaseEvento = "mensaje" | "nota" | "archivo" | "cambio";

export interface EventoEquipo {
  id: string;
  quien: string;
  momento: string;
  clase: ClaseEvento;
  texto: string;
}

export interface PersonaEquipo {
  nombre: string;
  total: number;
}

/** La cantidad de letras de un mensaje que se muestra en la lista. */
export const MAX_LETRAS_EVENTO = 140;

/** Esta autoría no es de una persona del equipo sino del celular del negocio (coexistencia). */
export const DESDE_EL_CELULAR = "Desde el celular";

const corto = (t: string) => {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length > MAX_LETRAS_EVENTO ? `${limpio.slice(0, MAX_LETRAS_EVENTO)}…` : limpio;
};

/**
 * Las notas que escribe el propio sistema cuando alguien pasa el chat de área, interviene o marca el borrado: ya salen desde la auditoría, así que no se repiten como «nota».
 * Es la misma frase con que las crean las acciones de la bandeja.
 */
export const esNotaDelSistema = (texto: string | null): boolean => /^.+ (pasó este chat de |intervino en este chat\.|marcó este chat como borrado|quitó la marca de «borrado)/.test(texto ?? "");

const ARCHIVO: Record<string, string> = {
  imagen: "Mandó una foto",
  audio: "Mandó un audio",
  video: "Mandó un video",
  documento: "Mandó un documento",
  sticker: "Mandó un sticker",
};

/** Qué hizo la persona con un mensaje suyo, o null si no cuenta (no es suyo, o es una nota que ya sale desde la auditoría). */
export function eventoDeMensaje(m: { id: string; direccion: string; tipo: string; texto: string | null; autor: string | null; momento: string }): EventoEquipo | null {
  if (!m.autor) return null;
  const base = { id: `m-${m.id}`, quien: m.autor, momento: m.momento };
  const texto = corto(m.texto ?? "");
  if (m.direccion === "nota") {
    if (esNotaDelSistema(m.texto)) return null;
    return { ...base, clase: "nota", texto: texto ? `Dejó una nota privada: «${texto}»` : "Dejó una nota privada" };
  }
  if (m.direccion !== "saliente") return null;
  if (m.tipo in ARCHIVO) return { ...base, clase: "archivo", texto: texto ? `${ARCHIVO[m.tipo]}: «${texto}»` : ARCHIVO[m.tipo] };
  if (m.tipo === "plantilla") return { ...base, clase: "mensaje", texto: texto ? `Mandó una plantilla: «${texto}»` : "Mandó una plantilla" };
  const verbo = m.autor === DESDE_EL_CELULAR ? "Respondió desde el celular" : "Respondió";
  return { ...base, clase: "mensaje", texto: texto ? `${verbo}: «${texto}»` : verbo };
}

/** Las acciones de la auditoría que ya salen como un mensaje del chat y no deben repetirse. */
export const ACCIONES_YA_EN_MENSAJES = ["enviar_archivo_whatsapp", "enviar_plantilla_whatsapp"];

/** Un evento de la auditoría como línea de la actividad: la etiqueta de la acción y, si trae, su detalle. */
export function eventoDeAuditoria(a: { id: string; accion: string; usuario: string | null; detalle: string | null; momento: string }, etiquetas: Record<string, string>): EventoEquipo {
  const etiqueta = etiquetas[a.accion] ?? a.accion;
  const detalle = (a.detalle ?? "").trim();
  return { id: `a-${a.id}`, quien: a.usuario || "Sistema", momento: a.momento, clase: "cambio", texto: detalle ? `${etiqueta}: ${corto(detalle)}` : etiqueta };
}

/** Los eventos del más nuevo al más viejo. */
export const ordenarEventos = (eventos: EventoEquipo[]): EventoEquipo[] => [...eventos].sort((a, b) => b.momento.localeCompare(a.momento) || b.id.localeCompare(a.id));

/** Quién hizo cuánto, de quien más hizo a quien menos (empata por nombre). */
export function personasDe(eventos: readonly EventoEquipo[]): PersonaEquipo[] {
  const cuentas = new Map<string, number>();
  for (const e of eventos) cuentas.set(e.quien, (cuentas.get(e.quien) ?? 0) + 1);
  return [...cuentas.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

// Borrar un chat o un mensaje de WhatsApp solo con autorización (28 oct 2026). Lo que hay que decidir sin tocar la base ni la red, para poder probarlo
// (src/lib/whatsapp/borrado.test.ts): quién puede autorizar, quién puede resolver una petición y cómo se escribe el motivo. Importa con rutas relativas.

import { jefesDe, type Ocupante, type PuestoBase } from "../puestos/organigrama";

export type EstadoSolicitud = "pendiente" | "autorizada" | "rechazada" | "cancelada";

export const MIN_MOTIVO = 5;
export const MAX_MOTIVO = 300;

/** El motivo escrito por una persona: sin saltos de línea ni espacios repetidos, con tope de largo. */
export const motivoLimpio = (texto: unknown): string => String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MOTIVO);
export const motivoValido = (motivo: string): boolean => motivo.length >= MIN_MOTIVO;

export interface QuienAutoriza {
  ids: string[];
  /** De dónde salió: el jefe en Puestos, o los administradores cuando la persona no tiene jefe con acceso al CRM. */
  origen: "jefe" | "administrador";
}

/**
 * Quiénes pueden autorizar el borrado que pide alguien: la persona por encima de ella en Puestos y organigrama (el jefe más cercano que exista,
 * saltando puestos vacantes); si no tiene jefe, o su jefe no puede abrir el CRM, los administradores. Nunca quien lo pide. `conAcceso` son las
 * personas que pueden abrir el CRM (sin eso no verían la petición). `null` si no hay a quién pedírselo.
 */
export function quienAutoriza(solicitanteId: string, puestos: PuestoBase[], ocupantes: Ocupante[], conAcceso: ReadonlySet<string>, administradores: readonly string[]): QuienAutoriza | null {
  const delJefe = (jefesDe(solicitanteId, puestos, ocupantes)?.usuarioIds ?? []).filter((id) => id !== solicitanteId && conAcceso.has(id));
  if (delJefe.length) return { ids: [...new Set(delJefe)], origen: "jefe" };
  const admins = administradores.filter((id) => id !== solicitanteId && conAcceso.has(id));
  return admins.length ? { ids: [...new Set(admins)], origen: "administrador" } : null;
}

/** Puede autorizar o rechazar quien está en la lista de quienes autorizan y no es quien lo pidió. */
export const puedeResolver = (usuarioId: string, autorizaA: readonly string[], solicitanteId: string | null): boolean => !!usuarioId && usuarioId !== solicitanteId && autorizaA.includes(usuarioId);

/** Puede cancelar una petición quien la hizo (o un administrador). */
export const puedeCancelar = (usuarioId: string, solicitanteId: string | null, esAdmin: boolean): boolean => esAdmin || (!!usuarioId && usuarioId === solicitanteId);

/** Un mensaje en una línea y corto, para mostrarlo en la lista de peticiones. */
export function vistaPreviaTexto(texto: string | null | undefined, max = 120): string {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

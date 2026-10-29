// «Nuevo contacto» de la bandeja (30 oct 2026, pedido de Jhokser): escribirle por primera vez a alguien con una plantilla de primer contacto. Escribirle primero a quien no lo espera es lo que
// más bloqueos y reportes causa (y de ahí salen las restricciones del número), así que el sistema pone sus propias barreras: hay que confirmar que la persona aceptó recibir mensajes
// (y cómo), solo se usan plantillas aprobadas **con botón para rechazar**, y hay un tope de contactos nuevos al día. Lo puro vive aquí para poder probarlo; las acciones, en
// `src/app/(app)/crm-dropshippers/bandeja/nuevo-contacto-actions.ts`.

/** Cuántos contactos nuevos se pueden iniciar al día entre todos los números. Pocos y espaciados: Meta mira cuántos bloquean o reportan. */
export const MAX_CONTACTOS_NUEVOS_DIA = 20;

/** Cómo aceptó la persona recibir mensajes (se anota en el chat y en la auditoría: es la prueba de su permiso). */
export const MEDIOS_PERMISO = [
  { id: "formulario", etiqueta: "Lo pidió en un formulario o registro" },
  { id: "llamada", etiqueta: "Lo aceptó en una llamada" },
  { id: "mensaje", etiqueta: "Lo aceptó por otro mensaje o correo" },
  { id: "en_persona", etiqueta: "Lo aceptó en persona" },
  { id: "nos_escribio", etiqueta: "Nos contactó antes por otro medio" },
] as const;

export type MedioPermiso = (typeof MEDIOS_PERMISO)[number]["id"];

export const etiquetaDeMedioPermiso = (id: string): string => MEDIOS_PERMISO.find((m) => m.id === id)?.etiqueta ?? "Otro medio";

export interface DatosNuevoContacto {
  nombre: string;
  medio: string;
  nota: string;
  confirmo: boolean;
}

export const MAX_NOMBRE_CONTACTO = 80;
export const MAX_NOTA_PERMISO = 300;

/** Lo que hace falta antes de escribirle primero a alguien: su nombre, que haya aceptado y cómo. Devuelve el motivo si falta algo, o null. */
export function validarNuevoContacto(d: DatosNuevoContacto): string | null {
  const nombre = d.nombre.trim();
  if (nombre.length < 2) return "Escribe el nombre de la persona.";
  if (nombre.length > MAX_NOMBRE_CONTACTO) return `El nombre es muy largo (máximo ${MAX_NOMBRE_CONTACTO} letras).`;
  if (!d.confirmo) return "Confirma que la persona aceptó recibir mensajes por WhatsApp: sin su permiso no se le escribe primero.";
  if (!MEDIOS_PERMISO.some((m) => m.id === d.medio)) return "Elige cómo aceptó recibir mensajes.";
  if (d.nota.trim().length > MAX_NOTA_PERMISO) return `La nota es muy larga (máximo ${MAX_NOTA_PERMISO} letras).`;
  return null;
}

/**
 * ¿Sirve esta plantilla para un primer contacto? Tiene que estar aprobada y llevar al menos un botón de respuesta (el «No, gracias» con que la persona se niega sin tener que bloquear).
 * Devuelve por qué no sirve, o null si sirve.
 */
export function motivoSinPlantilla(p: { estado: string; botones: string[] }): string | null {
  if (p.estado !== "aprobada") return "Meta todavía no la aprobó.";
  if (!p.botones.some((b) => b.trim())) return "No tiene botón para que la persona rechace: para un primer contacto usa una con «No, gracias».";
  return null;
}

/** El inicio del día de hoy en Panamá (UTC−5, sin horario de verano) como fecha ISO: desde ahí se cuentan los contactos nuevos del día. */
export function inicioDelDiaPanama(ahora: Date = new Date()): string {
  const enPanama = new Date(ahora.getTime() - 5 * 3_600_000);
  return `${enPanama.toISOString().slice(0, 10)}T05:00:00.000Z`;
}

/** Los contactos nuevos que quedan hoy (nunca menos de 0). */
export const contactosRestantes = (iniciadosHoy: number): number => Math.max(0, MAX_CONTACTOS_NUEVOS_DIA - iniciadosHoy);

/** La nota que queda en el chat: quién escribió primero y con qué permiso. */
export function notaDePermiso(autor: string, nombre: string, medio: string, nota: string): string {
  const extra = nota.trim() ? `: ${nota.trim()}` : "";
  return `${autor} inició este chat con una plantilla. Confirmó que ${nombre.trim()} aceptó recibir mensajes por WhatsApp (${etiquetaDeMedioPermiso(medio).toLowerCase()}${extra}).`;
}

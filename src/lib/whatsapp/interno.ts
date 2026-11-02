/**
 * «WhatsApp interno» (30 oct 2026, vuelve a ser por WhatsApp a pedido de Jhokser): el chat de un número de la empresa con el de otra área. Es WhatsApp de verdad, así que el primer
 * mensaje —y cualquiera pasadas 24 h sin respuesta— tiene que ser una plantilla aprobada; para eso «Primer contacto con permiso» (`primer_contacto`) sale como la predeterminada.
 */

/** El nombre de la plantilla que se ofrece primero en un chat interno (`PLANTILLAS_SUGERIDAS`, clave `primer_contacto`: la misma de «Nuevo contacto»). */
export const PLANTILLA_INTERNA = "primer_contacto";

/** La etiqueta de la variable de esa plantilla que dice quién escribe: se llena sola con el nombre de la persona que está escribiendo. */
export const ETIQUETA_NOMBRE_DEL_ASESOR = "nombre del asesor";

export const digitosDe = (texto: unknown) => String(texto ?? "").replace(/\D/g, "");

/** Si un teléfono es el de otro número de la empresa (con un mínimo de dígitos para no confundir un id de usuario de WhatsApp con un número). */
export function esNumeroDeLaEmpresa(telefono: unknown, numeros: readonly { numero: string | null }[]): boolean {
  const d = digitosDe(telefono);
  return d.length >= 7 && numeros.some((n) => digitosDe(n.numero) === d);
}

/** Si esta plantilla es la predeterminada del chat: la interna, y solo en un chat interno. */
export const esPlantillaPredeterminada = (nombre: string, interno: boolean) => interno && nombre === PLANTILLA_INTERNA;

/** Pone la predeterminada primera y deja las demás en su orden. */
export function conPredeterminadaPrimero<T extends { predeterminada: boolean }>(plantillas: readonly T[]): T[] {
  return [...plantillas.filter((p) => p.predeterminada), ...plantillas.filter((p) => !p.predeterminada)];
}

/** Lo que ya se sabe de una variable que se escribe al enviar: en la plantilla predeterminada, «Nombre del asesor» es quien está escribiendo. */
export function sugeridoParaVariable(etiqueta: string | null | undefined, interno: boolean, nombreDeQuienEscribe: string | null | undefined): string {
  if (!interno) return "";
  if (String(etiqueta ?? "").trim().toLowerCase() !== ETIQUETA_NOMBRE_DEL_ASESOR) return "";
  return String(nombreDeQuienEscribe ?? "").trim();
}

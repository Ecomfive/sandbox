/**
 * «WhatsApp interno» (30 oct 2026, vuelve a ser por WhatsApp a pedido de Jhokser): el chat de un número de la empresa con el de otra área. Es WhatsApp de verdad, así que el primer
 * mensaje —y cualquiera pasadas 24 h sin respuesta— tiene que ser una plantilla aprobada; para eso la plantilla «Mensaje interno entre áreas» sale como la predeterminada.
 */

/** El nombre de la plantilla que se ofrece primero en un chat interno (`PLANTILLAS_SUGERIDAS`, clave `mensaje_interno`). */
export const PLANTILLA_INTERNA = "mensaje_interno";

/** La etiqueta de la variable de esa plantilla que dice quién escribe: se llena sola con el área del número que manda. */
export const ETIQUETA_AREA_QUE_ESCRIBE = "área que escribe";

const NOMBRE_DEL_AREA: Record<string, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };

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

/** Lo que ya se sabe de una variable que se escribe al enviar: en la plantilla interna, «Área que escribe» es el área del número que manda. */
export function sugeridoParaVariable(etiqueta: string | null | undefined, interno: boolean, areaQueEscribe: string | null | undefined): string {
  if (!interno) return "";
  if (String(etiqueta ?? "").trim().toLowerCase() !== ETIQUETA_AREA_QUE_ESCRIBE) return "";
  return NOMBRE_DEL_AREA[String(areaQueEscribe ?? "")] ?? "";
}

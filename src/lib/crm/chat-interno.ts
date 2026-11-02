/**
 * El chat interno entre las áreas es el «WhatsApp interno»: una conversación del número de un área con el número de otra, por WhatsApp de verdad (con la ventana de 24 h y la
 * plantilla como primer mensaje). Entre el 30 oct 2026 y su vuelta a WhatsApp estuvo un rato como salas de notas dentro del sistema (migraciones 0202 a 0204); esas salas quedaron
 * guardadas, con el «teléfono» `interno:<sala>:<área>` (que no es un número), pero ya no se muestran ni se abren.
 */

/** Si un «teléfono» es de una de esas salas de notas viejas (nunca se trata como un número de WhatsApp). */
export const esTelefonoInterno = (telefono: string | null | undefined) => String(telefono ?? "").startsWith("interno:");

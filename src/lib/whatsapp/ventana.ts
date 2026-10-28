// La regla de las 24 h de WhatsApp: después del último mensaje del dropshipper, la empresa puede responder con texto libre durante
// 24 horas; pasado ese plazo, solo con una plantilla aprobada por Meta. Sin base ni red, para poder probarlo.

export const HORAS_VENTANA = 24;

/** Cuánto queda para responder con texto libre, en minutos (0 si la ventana está cerrada o nunca escribió). */
export function minutosVentana(ultimoEntrante: string | null, ahora: Date = new Date()): number {
  if (!ultimoEntrante) return 0;
  const fin = Date.parse(ultimoEntrante) + HORAS_VENTANA * 3_600_000;
  return Math.max(0, Math.floor((fin - ahora.getTime()) / 60_000));
}

/** «quedan 21 h», «quedan 35 min» o null si está cerrada. */
export function textoVentana(ultimoEntrante: string | null, ahora: Date = new Date()): string | null {
  const m = minutosVentana(ultimoEntrante, ahora);
  if (m <= 0) return null;
  return m >= 60 ? `quedan ${Math.floor(m / 60)} h` : `quedan ${m} min`;
}

/**
 * El código y el motivo de un envío rechazado, de cualquiera de las formas en que responden (28 oct 2026: con 360dialog la bandeja solo
 * decía «WhatsApp no lo envió», sin motivo): la de Meta (`error.code`, `error.error_data.details`, `error.message`), la de 360dialog
 * (`meta.developer_message`, `errors[].code/title/details`) o un texto suelto. Sin nada legible, el código HTTP.
 */
export function leerErrorEnvio(status: number, cuerpo: unknown): { codigo: number | null; mensaje: string } {
  const objeto = (v: unknown) => (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const o = objeto(cuerpo);
  const e = objeto(o.error);
  const datos = objeto(e.error_data);
  const meta = objeto(o.meta);
  const primero = objeto(Array.isArray(o.errors) ? o.errors[0] : null);
  const codigo = numero(e.code) ?? numero(primero.code);
  const mensaje =
    texto(datos.details) ?? texto(e.message) ?? texto(meta.developer_message) ?? texto(primero.details) ?? texto(primero.title) ?? texto(o.message) ?? texto(typeof cuerpo === "string" ? cuerpo.slice(0, 300) : null);
  return { codigo, mensaje: mensaje ?? `código ${status}` };
}

/** Un error de la API de WhatsApp en palabras para el equipo (los códigos son los de Meta). */
export function errorEnEspanol(codigo: number | null, mensaje: string | null): string {
  switch (codigo) {
    case 131047:
      return "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada.";
    case 131026:
      return "Ese número no puede recibir el mensaje (no tiene WhatsApp o no aceptó los términos nuevos).";
    case 131051:
      return "WhatsApp no acepta ese tipo de mensaje.";
    case 131056:
      return "Se le mandaron demasiados mensajes seguidos: espera un momento.";
    case 130429:
    case 80007:
      return "WhatsApp está limitando los envíos: inténtalo en unos minutos.";
    case 190:
      return "El acceso a WhatsApp venció: hay que renovar el token en Meta (WHATSAPP_TOKEN).";
    case 100:
      return "Meta rechazó el envío por un dato inválido.";
    default:
      return mensaje ? `WhatsApp no lo envió: ${mensaje}` : "WhatsApp no lo envió.";
  }
}

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
    case 130497:
      return ERROR_PAIS_RESTRINGIDO(null);
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

/** El nombre en español de un país por su código ISO («BR» → «Brasil»); null si no se sabe. */
function nombrePais(codigo: string | null | undefined): string | null {
  if (!codigo || !/^[A-Z]{2}$/.test(codigo)) return null;
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(codigo) ?? null;
  } catch {
    return null;
  }
}

/**
 * El 130497 de Meta (9 nov 2026: el número de México no pudo responderle a un cliente de Brasil): Meta no deja que la cuenta de WhatsApp de ese número le escriba a usuarios de ese
 * país. No es una falla del sistema ni se arregla reintentando.
 */
export const ERROR_PAIS_RESTRINGIDO = (pais: string | null) =>
  `Meta no deja que este número de la empresa le escriba a clientes de ${nombrePais(pais) ?? "ese país"}. No es una falla del sistema: contáctalo por otro medio (Dropi, correo) o desde la app de WhatsApp del celular, si este número también está ahí.`;

/**
 * El motivo de un mensaje que WhatsApp no entregó, como se guarda desde el aviso del webhook («130497: Business account is restricted…»), en palabras para el equipo.
 * `paisCliente` (código ISO, sale del teléfono del chat en el servidor) completa el país del 130497. Lo que no se reconoce queda como vino.
 */
export function errorDeEntrega(error: string | null, paisCliente: string | null = null): string | null {
  if (!error) return error;
  const m = /^(\d+):\s*([\s\S]*)$/.exec(error.trim());
  if (!m) return error;
  const codigo = Number(m[1]);
  if (codigo === 130497) return ERROR_PAIS_RESTRINGIDO(paisCliente);
  if (codigo === 131047 || codigo === 131026 || codigo === 131056 || codigo === 130429) return errorEnEspanol(codigo, m[2]);
  return error;
}

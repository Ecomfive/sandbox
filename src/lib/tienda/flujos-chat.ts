// Pausar los flujos de un chat de WhatsApp de tienda (14 nov 2026, pedido de Hernán). iComfly separa, por chat, «La IA» (responde sola) y «Los flujos» (los mensajes
// programados y las plantillas automáticas). La IA se pausa con `pausar_bot_conversacion`; para los flujos el conector tiene su propia herramienta, que el sistema busca
// en la lista del conector (no hay un nombre fijo documentado) y llama con lo que pida su esquema. Lógica pura, con su prueba.

export interface HerramientaConEsquema {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

const DE_FLUJOS = /flujo|flow|secuencia|sequence|automatiz/i;
const DE_PAUSA = /paus|pause|deten|stop|reanud|resume|activ|enable|disable|toggle|alternar/i;
// Las que solo leen o arman flujos no sirven aquí.
const NO_ES_PAUSA = /^(listar|ver|obtener|consultar|crear|editar|eliminar|borrar|duplicar|list|get|create|update|edit|delete|remove)_/i;

/** La herramienta del conector que pausa o reanuda los flujos de un chat; null si el conector no tiene una. */
export function herramientaDeFlujos(herramientas: HerramientaConEsquema[]): HerramientaConEsquema | null {
  const candidatas = herramientas.filter((h) => DE_FLUJOS.test(h.name) && DE_PAUSA.test(h.name) && !NO_ES_PAUSA.test(h.name));
  if (!candidatas.length) return null;
  // Mejor la que habla de pausar y de una conversación.
  const puntos = (h: HerramientaConEsquema) => (/paus|pause/i.test(h.name) ? 2 : 0) + (/conversa|chat|contact/i.test(h.name) ? 1 : 0);
  return [...candidatas].sort((a, b) => puntos(b) - puntos(a))[0];
}

type Propiedad = { type?: unknown };

function propiedades(h: HerramientaConEsquema): Record<string, Propiedad> {
  const s = h.inputSchema as { properties?: Record<string, Propiedad> } | null | undefined;
  return s && typeof s === "object" && s.properties && typeof s.properties === "object" ? s.properties : {};
}

const ES_ID = ["conversation_id", "conversacion_id", "chat_id", "id_conversacion"];
const ES_TELEFONO = ["telefono", "phone", "phone_number", "numero", "contact_phone"];
const ES_PAUSA = ["pausar", "pausado", "pausa", "paused", "pause"];
const ES_ACTIVO = ["activo", "activar", "active", "enabled", "habilitado", "reanudar", "resume"];
const ES_MOTIVO = ["motivo", "reason", "nota", "note"];

/** Los argumentos para pausar o reanudar los flujos de un chat con esa herramienta, o el motivo por el que no se puede armar. */
export function armarLlamadaFlujos(
  h: HerramientaConEsquema,
  p: { conversacionId: number | null; telefono: string; pausar: boolean; motivo: string },
): { args: Record<string, unknown> } | { error: string } {
  const props = propiedades(h);
  const llave = (opciones: string[]) => opciones.find((k) => k in props);
  const args: Record<string, unknown> = {};

  const id = llave(ES_ID);
  const tel = llave(ES_TELEFONO);
  if (id && p.conversacionId !== null) args[id] = p.conversacionId;
  else if (tel) args[tel] = p.telefono;
  else if (id) return { error: "El chat todavía no tiene conversación en iComfly." };
  else return { error: "iComfly no dice a qué chat se le pausan los flujos." };

  const pausa = llave(ES_PAUSA);
  const activo = llave(ES_ACTIVO);
  if (pausa) args[pausa] = p.pausar;
  else if (activo) args[activo] = !p.pausar;
  else if (/reanud|resume/i.test(h.name) && !/paus|pause/i.test(h.name)) {
    if (p.pausar) return { error: "iComfly solo deja reanudar los flujos con esa función." };
  } else if (/paus|pause|deten|stop/i.test(h.name)) {
    if (!p.pausar) return { error: "iComfly solo deja pausar los flujos con esa función." };
  } else {
    return { error: "No se pudo saber cómo pausar los flujos en iComfly." };
  }

  const motivo = llave(ES_MOTIVO);
  if (motivo) args[motivo] = p.motivo;
  return { args };
}

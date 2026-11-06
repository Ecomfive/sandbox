/**
 * En qué chat está trabajando cada persona de la bandeja (pedido de Hernán, 5 nov 2026). Va por Supabase Realtime Presence: nada se guarda en la base y, al cerrar la
 * pestaña o perder la conexión, la persona sale sola. El canal es público como `canal-bandeja.ts`, así que **no lleva datos de nadie**: la llave es el ID de la persona y
 * lo único que se publica es el ID del chat; el nombre y la foto salen del equipo que el servidor le da a la bandeja. Lógica pura, con prueba.
 */
export const CANAL_PRESENCIA_CHATS = "bandeja-presencia";

/** Sin tocar el mouse ni el teclado, a los cuántos minutos deja de contar como «trabajando en el chat»: con la pestaña a la vista y con ella en segundo plano. */
export const SIN_USO_VISIBLE_MS = 5 * 60_000;
export const SIN_USO_OCULTA_MS = 60_000;

/** Lo que publica cada pestaña: el chat en que está trabajando (null si no está en ninguno) y si la persona está usando el sistema. */
export interface PresenciaChat {
  chat: string | null;
  activa: boolean;
}

/** Hasta hace cuánto cuenta el último minuto trabajado para decir que alguien sigue en el sistema. */
export const VENTANA_EN_SISTEMA_MS = 3 * 60_000;

/** Alguien del equipo usando el sistema ahora mismo, según el aviso de cada minuto (`LatidoPresencia`), y la página en que está. */
export interface PersonaEnSistema {
  id: string;
  pagina: string;
}

/** Una persona que está trabajando en la bandeja y en qué chats (ninguno: está en la bandeja, sin chat abierto). */
export interface PersonaConectada {
  id: string;
  chats: string[];
}

/** Si la persona sigue trabajando en lo que tiene abierto. Al irse a otra pestaña tiene un minuto: ir a mirar algo a Dropi no la saca del chat. */
export const sigueActiva = (msSinUso: number, visible: boolean) => msSinUso < (visible ? SIN_USO_VISIBLE_MS : SIN_USO_OCULTA_MS);

/** De la presencia del canal (por persona, una entrada por pestaña) a quién está en cada chat. Yo no salgo: lo que importa es ver a los demás. */
export function personasPorChat(estado: Record<string, PresenciaChat[]>, miId: string): Record<string, string[]> {
  const chats: Record<string, string[]> = {};
  for (const [persona, pestanas] of Object.entries(estado)) {
    if (persona === miId) continue;
    for (const chat of new Set(pestanas.map((p) => p.chat).filter((c): c is string => !!c))) (chats[chat] ??= []).push(persona);
  }
  for (const lista of Object.values(chats)) lista.sort();
  return chats;
}

/** Los demás que están trabajando ahora en la bandeja, para la barra de arriba. Quien dejó de usar el sistema no sale. */
export function personasConectadas(estado: Record<string, PresenciaChat[]>, miId: string): PersonaConectada[] {
  return Object.entries(estado)
    .filter(([persona, pestanas]) => persona !== miId && pestanas.some((p) => p.activa))
    .map(([id, pestanas]) => ({ id, chats: [...new Set(pestanas.filter((p) => p.activa && p.chat).map((p) => p.chat as string))] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Para Dirección: quienes están usando el sistema pero no salen en la presencia en vivo, sea porque están en otra página o porque su pestaña no publica (abierta desde antes de
 * la función, o con la conexión en vivo bloqueada). Así nadie del equipo queda invisible.
 */
export function personasFuera(enSistema: PersonaEnSistema[], conectadas: PersonaConectada[], miId: string): PersonaEnSistema[] {
  const enVivo = new Set(conectadas.map((c) => c.id));
  return enSistema.filter((p) => p.id !== miId && !enVivo.has(p.id));
}

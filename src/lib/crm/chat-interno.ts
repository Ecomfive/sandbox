/**
 * El chat interno entre las áreas, por salas (30 oct 2026, pedido de Jhokser): cada persona elige con qué área habla —Atención, Comercial o Dirección—, solo con las personas de su propia área
 * o con todas a la vez. Una sala es un chat entre las áreas que la forman: `a`, `c` y `d` (solo esa área), `ac` (Atención y Comercial), `ad` (Atención y Dirección), `cd` (Comercial y Dirección) y
 * `acd` (las tres). Cada área ve su propia copia de la sala (una conversación de la bandeja con el teléfono `interno:<sala>:<área>`, que no es un teléfono
 * de verdad: nada sale a WhatsApp) y un mensaje se guarda en las copias de todas las áreas de la sala (`whatsapp_enviar_interno`, migración 0203).
 * Lo puro está aquí; la función SQL repite la correspondencia de letras con áreas.
 */

export type AreaChat = "atencion" | "comercial" | "direccion";
export type SalaInterna = "a" | "c" | "d" | "ac" | "ad" | "cd" | "acd";

export const AREAS_CHAT: readonly AreaChat[] = ["atencion", "comercial", "direccion"];
export const SALAS: readonly SalaInterna[] = ["a", "c", "d", "ac", "ad", "cd", "acd"];

/** Las áreas de cada sala. */
export const AREAS_DE_SALA: Record<SalaInterna, readonly AreaChat[]> = {
  a: ["atencion"],
  c: ["comercial"],
  d: ["direccion"],
  ac: ["atencion", "comercial"],
  ad: ["atencion", "direccion"],
  cd: ["comercial", "direccion"],
  acd: ["atencion", "comercial", "direccion"],
};

export const NOMBRE_DE_AREA: Record<AreaChat, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };

export const esSala = (v: unknown): v is SalaInterna => typeof v === "string" && (SALAS as readonly string[]).includes(v);
export const esAreaChat = (v: unknown): v is AreaChat => typeof v === "string" && (AREAS_CHAT as readonly string[]).includes(v);

/** El «teléfono» de la copia de una sala para un área: no es un número, sirve para encontrar la conversación. */
export const telefonoDeSala = (sala: SalaInterna, area: AreaChat) => `interno:${sala}:${area}`;

/** La sala y el área de una copia, según su «teléfono»; `null` si no es de una sala. */
export function salaDeTelefono(telefono: string | null | undefined): { sala: SalaInterna; area: AreaChat } | null {
  const m = /^interno:([a-z]+):([a-z]+)$/.exec(String(telefono ?? ""));
  if (!m || !esSala(m[1]) || !esAreaChat(m[2])) return null;
  return AREAS_DE_SALA[m[1]].includes(m[2]) ? { sala: m[1], area: m[2] } : null;
}

/** Si un «teléfono» es de una sala del chat interno (aunque su forma no sea válida: nunca se trata como un número de WhatsApp). */
export const esTelefonoInterno = (telefono: string | null | undefined) => String(telefono ?? "").startsWith("interno:");

/** Cómo se llama la sala para quien está en `miArea`: «Solo Dirección» (la de su propia área), el nombre de la otra área o «Todas las áreas». */
export function etiquetaDeSala(sala: SalaInterna, miArea: AreaChat): string {
  if (sala === "acd") return "Todas las áreas";
  if (AREAS_DE_SALA[sala].length === 1) return `Solo ${NOMBRE_DE_AREA[AREAS_DE_SALA[sala][0]]}`;
  const otra = AREAS_DE_SALA[sala].find((a) => a !== miArea);
  return NOMBRE_DE_AREA[otra ?? miArea];
}

export interface OpcionDeSala {
  sala: SalaInterna;
  etiqueta: string;
  /** Una línea que dice con quién se habla. */
  detalle: string;
}

/** Con quién puede hablar quien está en `miArea`: primero las personas de su propia área, luego cada una de las otras áreas y, al final, todas. */
export function opcionesDeSalas(miArea: AreaChat): OpcionDeSala[] {
  const salas = SALAS.filter((s) => AREAS_DE_SALA[s].includes(miArea));
  const propia = salas.filter((s) => AREAS_DE_SALA[s].length === 1);
  const dosAreas = salas.filter((s) => AREAS_DE_SALA[s].length === 2);
  const orden = (s: SalaInterna) => AREAS_CHAT.indexOf(AREAS_DE_SALA[s].find((a) => a !== miArea) ?? miArea);
  const detalle = (sala: SalaInterna) =>
    sala === "acd"
      ? "Las tres áreas en un mismo chat"
      : AREAS_DE_SALA[sala].length === 1
        ? `Solo las personas de ${NOMBRE_DE_AREA[miArea]}`
        : `Solo con ${NOMBRE_DE_AREA[AREAS_DE_SALA[sala].find((a) => a !== miArea) ?? miArea]}`;
  return [...propia, ...dosAreas.sort((a, b) => orden(a) - orden(b)), ...salas.filter((s) => s === "acd")].map((sala) => ({ sala, etiqueta: etiquetaDeSala(sala, miArea), detalle: detalle(sala) }));
}

/** El área de una persona para el chat: la de más arriba que tiene (Dirección, luego Comercial, luego Atención). Es la misma regla de `areaPropia`. */
export function areaPropiaDeChat(acceso: { direccion: boolean; comercial: boolean }): AreaChat {
  if (acceso.direccion) return "direccion";
  return acceso.comercial ? "comercial" : "atencion";
}

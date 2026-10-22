// El texto de las fotos informativas (beneficios, ingredientes y cómo se usa; 22 oct 2026): cómo se limpia lo que escribe el plan o el equipo,
// qué se le pide a Gemini y cómo se comprueba que la imagen quedó con el texto bien escrito. Las demás fotos no llevan texto. Sin base ni
// red, con prueba.

import { conTexto, DISTRIBUCION_TEXTO, LIMITES_TEXTO, type TipoConTexto } from "./fotos-base";
import { extraerJson } from "./openai";

/**
 * Lo que escribe el plan o la persona vuelto una lista de líneas limpias para la imagen: sin viñetas ni numeración (el número lo pone la
 * imagen), sin comillas, cada línea de a lo más `largo` caracteres (se corta en una palabra), sin repetidas y a lo más `max` líneas. Un tipo
 * que no lleva texto devuelve una lista vacía.
 */
export function normalizarTextos(tipo: string, crudo: unknown): string[] {
  if (!conTexto(tipo)) return [];
  const { max, largo } = LIMITES_TEXTO[tipo];
  const lineas = typeof crudo === "string" ? crudo.split(/\r?\n/) : Array.isArray(crudo) ? crudo : [];
  const out: string[] = [];
  for (const l of lineas) {
    if (typeof l !== "string") continue;
    let t = l
      .replace(/\s+/g, " ")
      .replace(/^\s*(?:[-•*·–—]|\d+\s*[.)-])\s*/, "")
      .replace(/^["«“'`]+|["»”'`]+$/g, "")
      .trim();
    if (t.length > largo) {
      const corte = t.slice(0, largo + 1);
      t = corte.slice(0, Math.max(corte.lastIndexOf(" "), Math.floor(largo / 2)));
    }
    t = t.replace(/[\s,;:.\-–—]+$/g, "").trim();
    if (t.length < 2 || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Promesas médicas: lo que no se puede escribir en una imagen de un suplemento o producto de salud (curar, tratar, garantizar). */
const RIESGO = /\b(?:cura|curar|curativ[oa]s?|sana(?:r)? (?:la |el )?(?:diabetes|cancer|cáncer)|elimina(?:r)? (?:la |el )?(?:diabetes|cancer|cáncer|enfermedad)|milagr\w*|garantiz\w*|garantizad\w*|sin efectos secundarios|adelgaz\w*|previen\w*|prevenci\w*|(?:alivia|aliviar|calma|elimina|quita)\w* (?:el |los |la |las )?dolor(?:es)?|trata(?:r)? (?:la |el )?(?:diabetes|cancer|cáncer|artritis|hipertensi[oó]n))\b|100 ?%/i;

/** La primera línea que promete curar, tratar o garantizar algo; undefined si ninguna. */
export const lineaRiesgosa = (textos: string[]): string | undefined => textos.find((t) => RIESGO.test(t));

/**
 * El bloque del pedido a Gemini para una foto informativa: el texto exacto (título fijo del tipo y las líneas), cómo se ve y cómo se reparte.
 * Siguiendo la guía de Google para escribir texto en imágenes: entre comillas, en español, con la tipografía nombrada y nada más.
 * Vacío si el tipo no lleva texto o no hay líneas.
 */
export function textoDeFoto(tipo: string, textos: string[]): string {
  if (!conTexto(tipo) || !textos.length) return "";
  const t: TipoConTexto = tipo;
  const lista = textos.map((x, i) => (t === "como_usar" ? `${i + 1}. «${x}»` : `- «${x}»`)).join("\n");
  return [
    `Texto de la imagen (escríbelo exactamente así, en español, con sus tildes, letra por letra: sin cambiar, quitar ni agregar palabras):\nTítulo: «${LIMITES_TEXTO[t].titulo}»\n${lista}`,
    "Tipografía de diseño editorial moderno, no genérica: el título en una sans-serif geométrica en negrita (estilo Montserrat o Poppins) y los textos de apoyo en una sans-serif humanista de peso medio (estilo Nunito u Open Sans), con jerarquía clara (título grande, texto de apoyo más pequeño), buen contraste, bien alineada y con un color de acento tomado del empaque. Si el estilo del equipo define la tipografía, úsala. No escribas ningún otro texto.",
    `Distribución: ${DISTRIBUCION_TEXTO[t]}`,
  ].join("\n");
}

/** El pedido para que la IA lea la imagen generada y copie el texto que ve, sin corregirlo (para compararlo con el que se pidió). */
export function pedidoLeerTexto(): { instrucciones: string; texto: string } {
  return {
    instrucciones: [
      "Eres un lector de texto en imágenes (OCR).",
      "Copia TODO el texto visible en la imagen, tal como está escrito, letra por letra, con sus tildes y signos. NO corrijas la ortografía ni completes palabras cortadas: si una palabra está mal escrita, cópiala mal escrita.",
      'Responde SOLO con un JSON, sin texto antes ni después: {"texto":"cada línea de texto separada por un salto de línea (\\n)"}. Si no hay texto, {"texto":""}.',
    ].join("\n\n"),
    texto: "Transcribe el texto de la imagen adjunta.",
  };
}

/** Lo que leyó la IA de la imagen: el campo `texto` del JSON o, si no vino JSON, la respuesta tal cual. */
export function textoLeido(respuesta: string): string {
  const j = extraerJson(respuesta);
  if (j && typeof j === "object" && typeof (j as { texto?: unknown }).texto === "string") return (j as { texto: string }).texto;
  return respuesta;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Compara lo que se pidió escribir con lo que leyó la IA: cada línea pedida debe aparecer completa (sin mayúsculas ni signos, **con
 * tildes**: una tilde que falta es una falta de ortografía). Devuelve las líneas que no aparecen, o ok si están todas.
 */
export function compararTexto(esperados: string[], leido: string): { ok: boolean; faltantes: string[] } {
  const hay = normalizar(leido);
  const faltantes = esperados.filter((e) => {
    const n = normalizar(e);
    return n.length > 0 && !hay.includes(n);
  });
  return { ok: faltantes.length === 0, faltantes };
}

/** Lo que se agrega al pedido de la foto cuando el primer intento salió con el texto mal escrito. */
export function avisoDeReintento(faltantes: string[]): string {
  return `En el intento anterior estas líneas salieron mal escritas o incompletas: ${faltantes.map((f) => `«${f}»`).join(", ")}. Escríbelas exactamente igual, letra por letra y con sus tildes.`;
}

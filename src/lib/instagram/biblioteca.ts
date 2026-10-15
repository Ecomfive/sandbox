/**
 * La Biblioteca de anuncios de Meta (pública, sin iniciar sesión) muestra de cada anuncio su anunciante, su texto y la página de
 * destino de su botón. Instagram no manda esa página en el mensaje directo, pero sí el copy: buscándolo **como frase exacta** en la
 * Biblioteca sale el anuncio y, con él, su destino. Esto arma esa búsqueda para abrirla con un clic (no lee nada por su cuenta:
 * Meta limita el acceso automático a la Biblioteca; la lectura la hace el marcador, ver `marcador.ts`).
 *
 * **Se busca el copy completo, no su primera línea** (probado el 15 oct 2026): el copy de IG-0026 es una plantilla que usan muchas
 * tiendas («Hay joyas bonitas… y hay joyas que cuentan tu historia»): su primera línea da 340 resultados de varios anunciantes y el
 * copy completo da 1, el anuncio buscado; el de IG-0027, 11 contra 10. La Biblioteca acepta frases de al menos 900 caracteres y busca
 * igual con o sin emojis y puntuación, así que el texto se limpia (solo letras y números) para no depender de comillas, puntos
 * suspensivos o emojis que Instagram y la Biblioteca escriban distinto.
 */
const MAX_PALABRAS = 8;
/** Hasta cuántos caracteres del copy se buscan: lo que pasa se corta en el límite de una palabra (una frase más corta del mismo copy sigue siendo exacta). */
const MAX_CARACTERES = 700;

/** El arranque del copy que sirve para buscarlo: sin emojis ni símbolos al inicio y hasta el primer signo o las 8 palabras. */
export function frasePorBuscar(copy: string | null | undefined, maxPalabras = MAX_PALABRAS): string | null {
  if (!copy) return null;
  const linea = copy
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /[\p{L}\p{N}]/u.test(l));
  if (!linea) return null;
  const sinSimbolos = linea.replace(/^[^\p{L}\p{N}]+/u, "");
  const hastaElSigno = sinSimbolos.split(/[,.:;!?&()\[\]{}"“”¡¿|/\\]/)[0];
  const palabras = hastaElSigno.split(/\s+/).filter(Boolean).slice(0, maxPalabras);
  // Una frase de una o dos palabras trae demasiados anuncios ajenos: se prefiere seguir hasta las 8 palabras, signos aparte.
  if (palabras.length < 3) {
    const todas = sinSimbolos.replace(/[,.:;!?&()\[\]{}"“”¡¿|/\\]+/g, " ").split(/\s+/).filter(Boolean).slice(0, maxPalabras);
    return todas.length >= 2 ? todas.join(" ") : null;
  }
  return palabras.join(" ");
}

/**
 * El copy completo para buscarlo: solo letras y números, con una sola separación entre palabras (los saltos de línea, los emojis y la
 * puntuación se quitan) y hasta `MAX_CARACTERES`, cortado en el límite de una palabra. Null si no hay al menos dos palabras.
 */
export function copyCompletoPorBuscar(copy: string | null | undefined): string | null {
  if (!copy) return null;
  const limpio = copy.normalize("NFC").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  if (limpio.split(" ").length < 2) return null;
  if (limpio.length <= MAX_CARACTERES) return limpio;
  const corte = limpio.slice(0, MAX_CARACTERES);
  const ultimo = corte.lastIndexOf(" ");
  return ultimo > 0 ? corte.slice(0, ultimo) : corte;
}

const BASE = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL";
const frase = (texto: string) => `${BASE}&q=${encodeURIComponent(`"${texto}"`)}&search_type=keyword_exact_phrase&media_type=all`;

/** La búsqueda del **copy completo** como frase exacta en la Biblioteca (todos los países y estados), o null si no hay copy que buscar. */
export function urlBibliotecaAnuncios(copy: string | null | undefined): string | null {
  const texto = copyCompletoPorBuscar(copy);
  return texto ? frase(texto) : null;
}

/**
 * La búsqueda solo de la **primera línea** del copy: para cuando el copy completo no encuentra nada (Instagram puede mostrar el texto
 * recortado o distinto al de la Biblioteca). Trae más resultados, de varios anunciantes si el copy es una plantilla. Null si no hay
 * una primera línea utilizable o si es lo mismo que el copy completo.
 */
export function urlBibliotecaPrimeraLinea(copy: string | null | undefined): string | null {
  const corta = frasePorBuscar(copy);
  if (!corta || corta === copyCompletoPorBuscar(copy)) return null;
  return frase(corta);
}

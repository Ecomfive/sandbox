/**
 * La Biblioteca de anuncios de Meta (pública, sin iniciar sesión) muestra de cada anuncio su anunciante, su texto y la página de
 * destino de su botón. Instagram no manda esa página en el mensaje directo, pero sí el copy: buscándolo **como frase exacta** en la
 * Biblioteca sale el anuncio y, con él, su destino. Esto arma esa búsqueda para abrirla con un clic (no lee nada por su cuenta:
 * Meta limita el acceso automático a la Biblioteca).
 */
const MAX_PALABRAS = 8;

/** El arranque del copy que sirve para buscarlo: sin emojis ni símbolos al inicio y hasta el primer signo o las 8 palabras. */
export function frasePorBuscar(copy: string | null | undefined): string | null {
  if (!copy) return null;
  const linea = copy
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /[\p{L}\p{N}]/u.test(l));
  if (!linea) return null;
  const sinSimbolos = linea.replace(/^[^\p{L}\p{N}]+/u, "");
  const hastaElSigno = sinSimbolos.split(/[,.:;!?&()\[\]{}"“”¡¿|/\\]/)[0];
  const palabras = hastaElSigno.split(/\s+/).filter(Boolean).slice(0, MAX_PALABRAS);
  // Una frase de una o dos palabras trae demasiados anuncios ajenos: se prefiere seguir hasta las 8 palabras, signos aparte.
  if (palabras.length < 3) {
    const todas = sinSimbolos.replace(/[,.:;!?&()\[\]{}"“”¡¿|/\\]+/g, " ").split(/\s+/).filter(Boolean).slice(0, MAX_PALABRAS);
    return todas.length >= 2 ? todas.join(" ") : null;
  }
  return palabras.join(" ");
}

/** La búsqueda de frase exacta en la Biblioteca de anuncios, en todos los países y todos los estados, o null si no hay copy que buscar. */
export function urlBibliotecaAnuncios(copy: string | null | undefined): string | null {
  const frase = frasePorBuscar(copy);
  if (!frase) return null;
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(`"${frase}"`)}&search_type=keyword_exact_phrase&media_type=all`;
}

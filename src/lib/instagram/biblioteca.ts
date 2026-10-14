/**
 * La Biblioteca de anuncios de Meta (pública, sin iniciar sesión) muestra de cada anuncio su anunciante, su texto y la página de
 * destino de su botón. Instagram no manda esa página en el mensaje directo, pero sí el copy: buscándolo **como frase exacta** en la
 * Biblioteca sale el anuncio y, con él, su destino. Esto arma esa búsqueda para abrirla con un clic (no lee nada por su cuenta:
 * Meta limita el acceso automático a la Biblioteca).
 */
const MAX_PALABRAS = 8;

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
 * La búsqueda en Google de la publicación de Instagram que tiene ese copy (`site:instagram.com "frase"`), para cuando lo compartido llegó
 * solo como archivo y no se tiene el enlace. Es una ayuda, no una garantía: probado el 14 oct, con el copy de un reel orgánico Google devolvió la
 * cuenta y otras publicaciones suyas pero no la exacta, y con el de un anuncio no devolvió nada (Instagram casi no se indexa y un anuncio
 * puede no tener publicación pública). Se usan hasta 10 palabras, algo más que para la Biblioteca.
 */
export function urlGoogleDeInstagram(copy: string | null | undefined): string | null {
  const frase = frasePorBuscar(copy, 10);
  if (!frase) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${frase}"`)}`;
}

/**
 * La búsqueda en la Biblioteca de anuncios, en todos los países y todos los estados, o null si no hay copy que buscar.
 * Con el nombre de la página se buscan sus palabras junto con las del copy: es igual de precisa cuando el anuncio es único (probado
 * con «Mundo Digital» + el copy de Perfectx: los mismos 4 anuncios que con la frase exacta) y evita mezclar a otros anunciantes
 * cuando el copy se repite en varias tiendas, algo habitual. Sin nombre se busca la frase exacta.
 */
export function urlBibliotecaAnuncios(copy: string | null | undefined, nombrePagina?: string | null): string | null {
  const frase = frasePorBuscar(copy);
  if (!frase) return null;
  const nombre = (nombrePagina ?? "").replace(/[^\p{L}\p{N}\s.&'-]+/gu, " ").replace(/\s+/g, " ").trim();
  const base = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL";
  if (nombre) return `${base}&q=${encodeURIComponent(`${nombre} ${frase}`)}&search_type=keyword_unordered&media_type=all`;
  return `${base}&q=${encodeURIComponent(`"${frase}"`)}&search_type=keyword_exact_phrase&media_type=all`;
}

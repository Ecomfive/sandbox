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
/** Hasta cuántos caracteres del copy se buscan: lo que pasa se corta en el límite de una palabra (una frase más corta del mismo copy sigue siendo exacta). */
const MAX_CARACTERES = 700;

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
 * La búsqueda del **nombre de la página** como frase exacta en la Biblioteca: muestra los anuncios de esa página (probado el 15 oct 2026 con
 * «Nenagoslingshop»: ~9 resultados, todos de esa página). Sirve donde no se puede abrir la página por su id (`view_all_page_id`, que sin iniciar
 * sesión no devuelve anuncios). Del nombre se usa lo anterior a « | » o « · » (Facebook agrega la ciudad: «Oferta VE | Caracas»).
 */
export function urlAnunciosDePagina(nombre: string | null | undefined): string | null {
  const corto = (nombre ?? "").split(/ [|·] /)[0];
  const limpio = corto.normalize("NFC").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  return limpio.length >= 2 ? frase(limpio) : null;
}

/**
 * La búsqueda del texto de un video en **TikTok** (su propia búsqueda, para encontrar el mismo producto en otras cuentas): las primeras
 * palabras del copy, sin emojis ni signos. TikTok no tiene una biblioteca pública de anuncios para estos países (la suya, la
 * «Commercial Content Library», solo cubre Europa), así que esto y el perfil de la cuenta son lo que se puede abrir.
 */
export function urlBusquedaTikTok(copy: string | null | undefined): string | null {
  const texto = copyCompletoPorBuscar(copy);
  if (!texto) return null;
  const palabras = texto.split(" ").slice(0, 10).join(" ");
  return `https://www.tiktok.com/search?q=${encodeURIComponent(palabras)}`;
}

/** Los «Top Ads» del Creative Center de TikTok para un país (los mejores anuncios que sus anunciantes autorizaron; para ver todos hay que iniciar sesión en TikTok). */
export function urlTopAdsTikTok(codigoPais: string | null | undefined): string {
  const region = /^[A-Za-z]{2}$/.test(codigoPais ?? "") ? (codigoPais as string).toUpperCase() : "US";
  return `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?period=30&region=${region}`;
}

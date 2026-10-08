// La sugerencia de SKU (regla elegida por Hernán, 8 oct 2026): las palabras del nombre en mayúsculas, sin acentos y unidas con
// barra («BALSAMO/PURPURA/MELAXIN»). Se saltan las palabras de relleno («de», «para», «con»…), los títulos («Dr.») y las medidas o números («9g», «50ml»,
// «2x1»), y se toman las 3 primeras que quedan. Una variante agrega sus valores («/ROJO/M»). Es solo una sugerencia: la
// persona puede borrarla y escribir otro; el sistema no deja repetir un SKU.

const RELLENO = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "para", "con", "sin", "en", "por", "a", "al", "un", "una", "x", "dr", "dra", "mr", "mrs"]);

/** Una palabra en mayúsculas, sin acentos ni signos («Púrpura» → «PURPURA»). */
export const palabraSku = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** El SKU sugerido para un nombre de producto (vacío si el nombre no tiene palabras útiles). */
export function sugerirSku(nombre: string, maxPalabras = 3): string {
  const palabras = nombre
    .split(/[\s/.,;:()\-–_"«»+&]+/)
    .map((p) => p.trim())
    .filter((p) => p && !RELLENO.has(palabraSku(p).toLowerCase()))
    // Medidas, cantidades y números («9g», «50ML», «2x1», «1000»): no identifican el producto.
    .filter((p) => !/^\d/.test(p))
    .map(palabraSku)
    .filter((p) => p.length >= 2);
  return palabras.slice(0, maxPalabras).join("/").slice(0, 50);
}

/** El SKU de una variante: el del producto más los valores de sus opciones («BALSAMO/PURPURA/MELAXIN/ROJO/M»). */
export function sugerirSkuVariante(base: string, valores: string[]): string {
  const partes = valores.map(palabraSku).filter(Boolean);
  return [base || "SKU", ...partes].join("/").slice(0, 60);
}

/** El primero libre: el sugerido o, si ya existe, con /2, /3… */
export function primeroLibre(sugerido: string, existe: (codigo: string) => boolean): string {
  if (!existe(sugerido)) return sugerido;
  for (let n = 2; n < 1000; n++) {
    const c = `${sugerido}/${n}`;
    if (!existe(c)) return c;
  }
  return sugerido;
}

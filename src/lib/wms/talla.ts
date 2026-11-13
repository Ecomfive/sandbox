// La talla como la nombra el equipo en las tiendas (13 nov 2026, pedido de Jhokser): XXL se dice «2XL», XXXL «3XL», XXS «2XS». Solo cambia lo que se MUESTRA: el SKU y lo guardado
// se quedan como están para no tener que corregirlos en las demás plataformas.

const TALLA_REPETIDA = /\b(X{2,})(S|L)\b/gi;

/** «XXL» → «2XL», «Beige / XXXL» → «Beige / 3XL». Lo que no es una talla con X repetida queda igual. */
export function etiquetaTalla(texto: string): string {
  return texto.replace(TALLA_REPETIDA, (_todo, equis: string, letra: string) => `${equis.length}X${letra.toUpperCase()}`);
}

// El orden de las tallas (13 nov 2026, pedido de Jhokser: siempre S, M, L, XL, 2XL, no por el código): de la más chica a la más grande. Primero las tallas de letra, luego los números
// (43, 44…) y al final lo demás (colores, «Única»…), cada grupo en su orden.
const ORDEN_TALLAS = ["3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const ES_NUMERO = /^[+-]?\d+(?:[.,]\d+)?$/;

const rangoDeTalla = (texto: string) => ORDEN_TALLAS.indexOf(etiquetaTalla(texto.trim()).toUpperCase());

/** Si el texto es una talla de letra conocida (S, M, L, XL, XXL, 2XL…). */
export const esTallaConocida = (texto: string) => rangoDeTalla(texto) >= 0;

/** Compara dos valores de una opción: tallas de letra por su tamaño, números de menor a mayor y lo demás por letra. */
export function compararTalla(a: string, b: string): number {
  const ra = rangoDeTalla(a);
  const rb = rangoDeTalla(b);
  if (ra >= 0 || rb >= 0) return ra >= 0 && rb >= 0 ? ra - rb : ra >= 0 ? -1 : 1;
  const na = ES_NUMERO.test(a.trim());
  const nb = ES_NUMERO.test(b.trim());
  if (na || nb) return na && nb ? Number(a.trim().replace(",", ".")) - Number(b.trim().replace(",", ".")) : na ? -1 : 1;
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

/** Compara dos variantes por lo que dicen sus opciones, de izquierda a derecha: «Beige / S» antes que «Beige / M», y los colores por letra. */
export function compararOpciones(a: string, b: string): number {
  const pa = a.split(" / ");
  const pb = b.split(" / ");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const c = compararTalla(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return pa.length - pb.length;
}

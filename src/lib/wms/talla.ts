// La talla como la nombra el equipo en las tiendas (13 nov 2026, pedido de Jhokser): XXL se dice «2XL», XXXL «3XL», XXS «2XS». Solo cambia lo que se MUESTRA: el SKU y lo guardado
// se quedan como están para no tener que corregirlos en las demás plataformas.

const TALLA_REPETIDA = /\b(X{2,})(S|L)\b/gi;

/** «XXL» → «2XL», «Beige / XXXL» → «Beige / 3XL». Lo que no es una talla con X repetida queda igual. */
export function etiquetaTalla(texto: string): string {
  return texto.replace(TALLA_REPETIDA, (_todo, equis: string, letra: string) => `${equis.length}X${letra.toUpperCase()}`);
}

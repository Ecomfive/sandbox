/**
 * Nuestros precios en el análisis de competencia de Effi, al día por la API (7 nov 2026, pedido de Hernán: Francis igualó precios a la competencia en Effi y el análisis seguía con los
 * de la última lectura del catálogo, que se hace con sesión). La API de artículos trae nuestros precios; el catálogo con los de la competencia sigue fuera de la API. Cada artículo nuestro
 * del catálogo se reconoce por el archivo de su foto (`effi_clave`), que es el mismo de la API. Lógica pura, con prueba.
 */

export interface NuestroEnCatalogo {
  id: string;
  effiClave: string;
  precio: number | null;
  precioSugerido: number | null;
}

export interface ArticuloConPrecio {
  fotoUrl: string | null;
  precioDropshipping: number | null;
  precioSugerido: number | null;
}

export interface CambioPrecioNuestro {
  id: string;
  precio: number;
  precioSugerido: number | null;
  /** El precio que tenía, para el historial; `null` si no cambió el precio y solo el sugerido. */
  precioAntes: number | null;
}

/** El nombre del archivo de una foto de Effi: lo mismo que `effi_clave`. */
export const archivoDeFoto = (url: string | null | undefined) => (url ? (url.split("?")[0].split("/").pop() ?? "") : "");

const igual = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);

/** Los artículos nuestros del catálogo cuyo precio (o sugerido) ya no es el que dice la API. Sin precio en la API, no se toca. */
export function cambiosPrecioNuestros(nuestros: readonly NuestroEnCatalogo[], articulos: readonly ArticuloConPrecio[]): CambioPrecioNuestro[] {
  const porArchivo = new Map(articulos.filter((a) => a.precioDropshipping !== null).map((a) => [archivoDeFoto(a.fotoUrl), a]));
  porArchivo.delete("");
  return nuestros.flatMap((n) => {
    const a = porArchivo.get(n.effiClave);
    if (!a || a.precioDropshipping === null) return [];
    const cambiaPrecio = !igual(n.precio, a.precioDropshipping);
    const cambiaSugerido = a.precioSugerido !== null && !igual(n.precioSugerido, a.precioSugerido);
    if (!cambiaPrecio && !cambiaSugerido) return [];
    return [{ id: n.id, precio: a.precioDropshipping, precioSugerido: a.precioSugerido ?? n.precioSugerido, precioAntes: cambiaPrecio ? n.precio : null }];
  });
}

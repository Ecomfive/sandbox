// Categorías de producto con la taxonomía estándar de Shopify en español (migración 0113). Lógica pura, con prueba: leer el
// archivo que publica Shopify y agrupar una categoría para los reportes.

export interface CategoriaTaxonomia {
  /** El id corto de Shopify: «hb-3-2-9». */
  id: string;
  ruta: string;
  nombre: string;
  nivel: number;
  padre: string | null;
}

export const SEPARADOR = " > ";

/** Lee `categories.txt` de Shopify («gid://shopify/TaxonomyCategory/hb-3 : Salud y belleza > Cuidado personal»). */
export function leerTaxonomia(texto: string): CategoriaTaxonomia[] {
  const out: CategoriaTaxonomia[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^gid:\/\/shopify\/TaxonomyCategory\/([a-z0-9-]+)\s*:\s*(.+)$/.exec(linea.trim());
    if (!m) continue;
    const [, id, ruta] = m;
    const partes = ruta.split(SEPARADOR);
    out.push({ id, ruta, nombre: partes[partes.length - 1], nivel: partes.length, padre: id.includes("-") ? id.slice(0, id.lastIndexOf("-")) : null });
  }
  return out;
}

/** «Salud y belleza» es la mitad del catálogo: en los reportes se abre un nivel más que las demás. */
const PRIMERAS_CON_UN_NIVEL_MAS = ["Salud y belleza"];
/** Ramas que en los reportes se abren hasta un nivel dado: juntan cosas muy distintas (cuidado de la piel y maquillaje;
 * suplementos y productos para bajar de peso; lencería y ropa exterior). */
const RAMAS_MAS_PROFUNDAS: [string, number][] = [
  ["Salud y belleza > Cuidado personal > Cosméticos", 4],
  ["Salud y belleza > Cuidado de la salud > Nutrición y actividad física", 4],
  ["Ropa y accesorios > Prendas de vestir", 3],
];

/**
 * El grupo de una categoría para los reportes: sus dos primeros niveles («Casa y jardín > Cocina y comedor»), tres en Salud y
 * belleza («Salud y belleza > Cuidado personal > Cuidado capilar») y uno más en las ramas de `RAMAS_MAS_PROFUNDAS`
 * («… > Cosméticos > Cuidado de la piel»). Sin categoría, null.
 */
export function grupoReporte(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  const partes = ruta.split(SEPARADOR);
  // Las ramas que juntan cosas muy distintas para el negocio se abren un nivel más (ver `RAMAS_MAS_PROFUNDAS`).
  const rama = RAMAS_MAS_PROFUNDAS.find(([prefijo]) => ruta === prefijo || ruta.startsWith(prefijo + SEPARADOR));
  const niveles = rama ? rama[1] : PRIMERAS_CON_UN_NIVEL_MAS.includes(partes[0]) ? 3 : 2;
  return partes.slice(0, niveles).join(SEPARADOR);
}

/** El primer nivel («Salud y belleza»). */
export const primerNivel = (ruta: string | null | undefined) => (ruta ? ruta.split(SEPARADOR)[0] : null);

/** Para mostrar: «Salud y belleza › Cuidado personal». */
export const rutaLegible = (ruta: string) => ruta.split(SEPARADOR).join(" › ");

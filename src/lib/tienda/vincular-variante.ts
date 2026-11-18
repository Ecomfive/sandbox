// Gestión de tienda › Productos de Shopify (3 nov 2026): la sugerencia del producto nuestro para cada variante de Shopify, con las mismas reglas que
// Gestión de IDs Dropi (`sugerirSku` de publicaciones/vincular.ts: exacta por SKU o nombre, parecido por nombre o foto, y un pack va a su compuesto).
// El SKU de Shopify cuenta para la coincidencia exacta. Una persona confirma siempre: aquí solo se sugiere. Sin base ni React.

import { sugerirSku, type ContextoVincular, type Sugerencia } from "@/lib/publicaciones/vincular";

export interface VarianteShopify {
  productoTitulo: string;
  /** El nombre de la variante en Shopify («M / Negro»); «Default Title» cuando el producto no tiene variantes. */
  varianteTitulo: string | null;
  sku: string | null;
  huella: string | null;
}

/** Shopify llama «Default Title» a la única variante de un producto sin opciones: no es parte del nombre. */
export function tituloVariante(t: string | null | undefined): string | null {
  const v = (t ?? "").trim();
  return v && v.toLowerCase() !== "default title" ? v : null;
}

/** El nombre completo de la variante, como se ve en la lista («Faja reductora · M / Negro»). */
export function nombreVariante(v: Pick<VarianteShopify, "productoTitulo" | "varianteTitulo">): string {
  const t = tituloVariante(v.varianteTitulo);
  return t ? `${v.productoTitulo} · ${t}` : v.productoTitulo;
}

/**
 * Los textos del SKU de Shopify que cuentan para la coincidencia exacta: el SKU tal cual y, si viene como «N.º/CÓDIGO» (12 nov 2026: así está en Kenku,
 * «0007/ACEITE/BATANA/ROMERO»), también el código solo, que es el nuestro.
 */
export function textosDeSku(sku: string | null | undefined): string[] {
  const s = (sku ?? "").trim();
  if (!s) return [];
  const m = /^\d{1,5}\/(.+)$/.exec(s);
  return m ? [s, m[1].trim()] : [s];
}

/** La sugerencia para una variante: primero con el nombre completo (producto y variante) y, si no da nada, con el del producto solo. */
export function sugerirParaVariante(v: VarianteShopify, ctx: ContextoVincular): Sugerencia {
  const textos = textosDeSku(v.sku);
  const completa = sugerirSku({ nombre: nombreVariante(v).replace(" · ", " "), huella: v.huella, textosDropi: textos }, ctx);
  if (completa.tipo !== "ninguno" || !tituloVariante(v.varianteTitulo)) return completa;
  return sugerirSku({ nombre: v.productoTitulo, huella: v.huella, textosDropi: textos }, ctx);
}

/** Hasta cuántas unidades del producto puede llevar una sola venta de Shopify (un «Lleva 3» son 3; más de 100 es un error de tecleo). */
export const MAX_UNIDADES_VENTA = 100;

/** Las palabras que, tras un número, son una medida o parte del nombre y no cuántos lleva («5 metros», «3 meses», «7 days», «3 en 1»). */
const MEDIDAS =
  /^(?:m|mt|mts|metros?|cm|mm|pulgadas?|ml|l|lt|litros?|oz|onzas?|g|gr|gramos?|kg|kilos?|lb|libras?|w|v|mah|gb|tb|hz|meses|mes|dias?|days?|años|anos|horas?|hours?|min|minutos?|piezas|pzs|pcs|capsulas|tabletas|gomitas|sobres|en|in|de|del|y|x)\b/;

const plano = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Cuántos recibe el cliente según un texto de oferta: «Paga 1 kit y lleva 2» → 2, «Compra 4 Unidades Lleva 8» → 8, «4 y Lleva 2 gratis» → 6,
 * «Compra 2 und.» → 2, «2x1» → 2, «Pack 3» → 3, «2 Negro + 1 Blanco» → 3 y, si `inicio`, un número al empezar («2 cintas x B/. 29.99» → 2; no un
 * tono como «02 Mauve»).
 */
function unidadesDeTexto(texto: string, inicio: boolean): number | null {
  const t = plano(texto).replace(/\s+/g, " ").trim();
  const compra = /\b(?:compra|compras|compre|paga|pagas|pague)(?: solo)? ?(\d{1,2})\b/.exec(t) ?? /^(\d{1,2}) y (?:lleva|llevas|recibe|recibes)\b/.exec(t);
  const gratis = /\b(?:lleva|llevas|llevate|recibe|recibes|obten|obtenga|obtienes)(?: otros?| las?| los?)? ?(\d{1,2})\b[^/|]*?\bgratis\b/.exec(t);
  // «Compra 4 y recibe 2 gratis»: recibe 6.
  if (gratis && compra) return Number(compra[1]) + Number(gratis[1]);
  const lleva = /\b(?:lleva|llevas|llevate|recibe|recibes)(?: el| los| las)? ?(\d{1,2})\b/.exec(t);
  if (lleva) return Number(lleva[1]);
  if (compra) return Number(compra[1]);
  const xy = /\b(\d{1,2}) ?x ?(\d{1,2})\b/.exec(t);
  if (xy && Number(xy[1]) > Number(xy[2])) return Number(xy[1]);
  const pack = /\b(?:pack|paquete) (?:de |con )?(\d{1,2})\b/.exec(t) ?? /\bpack ?-? ?(\d{1,2})\b/.exec(t);
  if (pack) return Number(pack[1]);
  if (!inicio) return null;
  // «2 Negro + 1 Blanco / XL»: la suma (solo colores o nombres de una palabra; «4 libros + 1 bolígrafo mágico» es un kit, no un paquete).
  const primera = t.split(" / ")[0];
  if (/^[1-9]\d? [a-z]+(?: ?\+ ?[1-9]\d? [a-z]+)+$/.test(primera)) {
    const suma = [...primera.matchAll(/(?:^|\+ ?)([1-9]\d?) [a-z]/g)].reduce((n, m) => n + Number(m[1]), 0);
    if (suma) return suma;
  }
  if (primera.includes("+")) return null;
  // Un número al empezar (sin cero adelante: «02 Mauve» es un tono) seguido de una palabra que no es una medida («2 cintas x B/. 29.99», «3 unidades»).
  const n = /^([1-9]\d?) ([a-z]+)/.exec(t);
  if (n && !MEDIDAS.test(n[2])) return Number(n[1]);
  return null;
}

/**
 * Cuántas unidades del producto lleva una venta de esa variante de Shopify, si se nota que es un paquete del mismo producto (18 nov 2026, pedido de
 * Hernán: «Paga 1 y lleva 2» descuenta 2): por el final del SKU («PESTAÑAS MAGNÉTICAS/X3», «LA/CEJAS/NEGRO/X2») o por el nombre de la variante (o el del
 * producto, si no tiene variantes). Cuenta lo que recibe el cliente, no lo que paga. Es solo la sugerencia: una persona la confirma. `null` = 1.
 */
export function unidadesDeVariante(v: Pick<VarianteShopify, "sku" | "varianteTitulo" | "productoTitulo">): number | null {
  const valida = (n: number | null) => (n !== null && n >= 2 && n <= 20 ? n : null);
  const sku = /(?:^|[^a-z0-9])x[- ]?(\d{1,2})$/i.exec((v.sku ?? "").trim());
  if (sku) return valida(Number(sku[1]));
  // El nombre de la variante; si no tiene, el del producto (sin el número del inicio: «7 Days Fungus» es un nombre, no 7 unidades).
  const variante = tituloVariante(v.varianteTitulo);
  return valida(variante ? unidadesDeTexto(variante, true) : unidadesDeTexto(v.productoTitulo, false));
}

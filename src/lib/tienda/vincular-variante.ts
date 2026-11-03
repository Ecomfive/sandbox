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

/** La sugerencia para una variante: primero con el nombre completo (producto y variante) y, si no da nada, con el del producto solo. */
export function sugerirParaVariante(v: VarianteShopify, ctx: ContextoVincular): Sugerencia {
  const textos = v.sku?.trim() ? [v.sku.trim()] : [];
  const completa = sugerirSku({ nombre: nombreVariante(v).replace(" · ", " "), huella: v.huella, textosDropi: textos }, ctx);
  if (completa.tipo !== "ninguno" || !tituloVariante(v.varianteTitulo)) return completa;
  return sugerirSku({ nombre: v.productoTitulo, huella: v.huella, textosDropi: textos }, ctx);
}

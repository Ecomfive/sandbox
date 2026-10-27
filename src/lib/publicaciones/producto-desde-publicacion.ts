// Gestión de IDs Dropi › crear el producto de una publicación (pedido de Jhokser, 27 oct 2026): un pack de 2 o 3, o un combo de varios
// productos, necesita su producto compuesto en Producto. Se crea desde la propia publicación (también quien no abre Producto, como Nicole),
// con su nombre, su SKU y su misma foto. Sin base ni React, para poder probarlo.

/** Las fotos de una publicación que viven en nuestro almacenamiento (no las de Dropi): las únicas que se pueden copiar a un producto. */
const FOTO_PROPIA = /^https:\/\/[^\s?]+\/storage\/v1\/object\/public\/wms-productos\/publicaciones\/[^\s?]+$/i;

/** La primera foto que se puede usar para el producto (la de la publicación), o null si ninguna está en nuestro almacenamiento. */
export function fotoParaProducto(urls: (string | null | undefined)[]): string | null {
  return urls.find((u): u is string => !!u && FOTO_PROPIA.test(u) && !u.includes("..")) ?? null;
}

/**
 * ¿El nombre suena a un pack o a un combo («Pack x2», «Combo Crema + Sérum», «2x1», «Kit», «Dúo»)? Solo decide con qué tipo se abre la
 * ficha del producto (Compuesto o Simple): la persona lo puede cambiar.
 */
export function pareceCompuesto(nombre: string): boolean {
  return /\b(pack|combo|kit|d[uú]o|tr[ií]o)\b|\b\d\s?x\s?\d\b|\bx\s?\d\b|\s\+\s/i.test(String(nombre ?? ""));
}

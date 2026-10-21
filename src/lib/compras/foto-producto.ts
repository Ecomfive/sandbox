// La foto del producto en Compras (21 oct 2026): cada línea de una compra muestra la foto de su producto de Producto y, si ese
// producto no tiene, la de otro producto con el mismo nombre. Una compra sin productos vinculados muestra la del producto con su
// mismo nombre o su misma foto. Lógica pura, con prueba.

import { yaVisto, type IndiceReferencias } from "@/lib/scraping/cruces";
import { palabrasClave } from "@/lib/wms/duplicados";

/** El nombre reducido a sus palabras útiles: «Cayenne Peppper Vivonu 240 Softgel» y «CAYENNE PEPPPER VIVONU softgel» dan lo mismo. */
export function claveNombre(nombre: string): string {
  return palabrasClave(nombre).sort().join(" ");
}

/** De cada nombre, la foto del primer producto que la tiene. */
export function fotosPorNombre(productos: { nombre: string; foto: string | null }[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of productos) {
    const clave = claveNombre(p.nombre);
    if (p.foto && clave && !mapa.has(clave)) mapa.set(clave, p.foto);
  }
  return mapa;
}

/** La foto de un producto: la suya o, si no tiene, la de otro producto con el mismo nombre. */
export function fotoDeProducto(p: { nombre: string; foto: string | null }, porNombre: Map<string, string>): string | null {
  return p.foto ?? porNombre.get(claveNombre(p.nombre)) ?? null;
}

export interface ProductoParecido {
  id: string;
  /** Cómo se encontró: por el nombre o por la foto (la foto sola no basta: también comparte alguna palabra). */
  como: "nombre" | "foto";
}

/** El producto de Producto que parece ser el de una compra sin productos vinculados: mismo nombre (85 %) o misma foto. */
export function productoDeCompra(nombre: string, huella: string | null, indice: IndiceReferencias): ProductoParecido | null {
  const c = yaVisto(nombre, huella, indice);
  return c ? { id: c.id, como: c.porFoto ? "foto" : "nombre" } : null;
}

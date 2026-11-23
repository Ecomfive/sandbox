// Anuncios Meta › la etapa que de verdad tiene una campaña (23 nov 2026, pedido de Alcides): en estas cuentas se sube **solo lo que es para vender**, pero el nombre de la campaña dice «CBO TEST»
// aunque el producto ya esté en Producto como Activo, así que todo salía «Testing». Regla, lógica pura y con prueba:
//   1. Lo corregido a mano manda.
//   2. Si el nombre dice Escala o Retargeting, se respeta.
//   3. Si el producto de la campaña es uno de **Test** en Producto (se está probando, todavía no se compra), es Testing.
//   4. Si el producto ya salió de Test (Activo, Inactivo o Descontinuado) → **Ventas**. Y si no se reconoce el producto, también Ventas: en estas cuentas todo es para vender.
// El producto de la campaña es un texto («EO ACEITE VEGANIC», «PRUEBA SHILAJIT»); se cruza con el nombre de los productos de Producto con una regla estricta: **todas** las palabras de la campaña
// (sin los códigos «EO», «RA», «PRUEBA»…) tienen que estar en el nombre del producto. Es mejor no reconocerlo (queda Ventas) que reconocer uno equivocado.

import type { Etapa } from "./nombre";

export interface ProductoDeCatalogo {
  nombre: string;
  /** `clase` del producto: «fisico» (Activo), «test», «inactivo» o «descontinuado». */
  clase: string;
}

/** Códigos que el equipo antepone al producto en el nombre de la campaña y que no son parte de su nombre. */
const CODIGOS = new Set(["eo", "ra", "prueba", "test", "testing", "retest", "rt", "nuevo", "copia", "copy"]);
const RELLENO = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "y", "en", "e", "a", "por", "x", "pack", "combo", "oferta", "2x1"]);

export function palabrasDeProducto(texto: string): string[] {
  const limpio = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const palabras = limpio.split(/[^a-z0-9]+/).filter((p) => p.length >= 2 && !CODIGOS.has(p) && !RELLENO.has(p));
  return [...new Set(palabras)];
}

const igual = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

export interface IndiceCatalogo {
  productos: { nombre: string; test: boolean; palabras: string[] }[];
}

export function indexarCatalogo(productos: ProductoDeCatalogo[]): IndiceCatalogo {
  return { productos: productos.map((p) => ({ nombre: p.nombre, test: p.clase === "test", palabras: palabrasDeProducto(p.nombre) })).filter((p) => p.palabras.length > 0) };
}

/**
 * El producto de Producto que es el de la campaña, o null. Todas las palabras de la campaña deben estar en el nombre del producto y al menos una tiene 4 letras o más; gana el nombre más corto
 * (el más parecido) y, si dos empatan, el que ya no es de Test.
 */
export function productoDeCampana(nombre: string | null | undefined, indice: IndiceCatalogo): { nombre: string; test: boolean } | null {
  const buscadas = palabrasDeProducto(nombre ?? "");
  if (!buscadas.length || !buscadas.some((p) => p.length >= 4)) return null;
  let mejor: { nombre: string; test: boolean; puntos: number } | null = null;
  for (const p of indice.productos) {
    if (!buscadas.every((b) => p.palabras.some((q) => igual(b, q)))) continue;
    const puntos = buscadas.length / p.palabras.length + (p.test ? 0 : 0.001);
    if (!mejor || puntos > mejor.puntos) mejor = { nombre: p.nombre, test: p.test, puntos };
  }
  return mejor ? { nombre: mejor.nombre, test: mejor.test } : null;
}

export interface EtapaEfectiva {
  etapa: Etapa;
  /** Por qué: se muestra en la ficha de la campaña. */
  motivo: string;
}

/** La etapa que se usa para una campaña. `delNombre` es la etapa guardada (la que dice el nombre o la corregida a mano). */
export function etapaEfectiva(o: { delNombre: Etapa | null; manual: boolean; producto: { nombre: string; test: boolean } | null }): EtapaEfectiva {
  if (o.manual && o.delNombre) return { etapa: o.delNombre, motivo: "Corregida a mano." };
  if (o.delNombre === "escala" || o.delNombre === "retargeting") return { etapa: o.delNombre, motivo: "Así lo dice el nombre de la campaña." };
  if (o.producto?.test) return { etapa: "testing", motivo: `El producto «${o.producto.nombre}» sigue en Test en Producto.` };
  if (o.producto) return { etapa: "venta", motivo: `El producto «${o.producto.nombre}» ya salió de Test en Producto: la campaña es para vender, aunque el nombre diga test.` };
  return { etapa: "venta", motivo: "No se reconoció un producto en Test: en estas cuentas todo lo que se sube es para vender." };
}

// Gestión de IDs Dropi › crear el producto de una publicación (pedido de Jhokser, 27 oct 2026): un pack de 2 o 3, o un combo de varios
// productos, necesita su producto compuesto en Producto. Se crea desde la propia publicación (también quien no abre Producto, como Nicole),
// con su nombre, su SKU y su misma foto. Sin base ni React, para poder probarlo.

import { palabrasClave, parecidoNombre } from "@/lib/wms/duplicados";
import { detectarPack, nombreBase } from "./vincular";

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

export interface SimpleParaSugerir {
  id: string;
  codigo: string;
  nombre: string;
}

/** Todas las palabras de un nombre, sin tildes ni mayúsculas y con los números («Shilajit (8 en 1)» → shilajit, 8, en, 1). */
const fichaDe = (texto: string): Set<string> =>
  new Set(
    String(texto ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

/** Palabras de venta que no dicen qué producto es («Regalo», «Gratis», «Oferta»). */
const PALABRAS_DE_VENTA = new Set(["regalo", "gratis", "oferta", "promo", "promocion", "kit", "combo", "pack", "duo", "trio"]);

/**
 * Los componentes que se sugieren al crear el compuesto de una publicación, a partir de su nombre: un combo de varios productos
 * («Óxido Nítrico + Shilajit», «Crema y Sérum») busca un producto simple por cada parte; un pack de uno solo («Crema Nida Pack 2», «x3»)
 * sugiere ese producto con la cantidad del pack. Solo es un adelanto para no buscarlos a mano: la persona los revisa y cambia. Nunca repite un
 * producto, ni sugiere uno cuyo parecido con la parte sea flojo, ni elige entre dos igual de parecidos; si el nombre no suena a pack ni a combo, no sugiere nada.
 */
export function sugerirComponentes(nombre: string, simples: SimpleParaSugerir[]): { componenteId: string; cantidad: number }[] {
  const pack = detectarPack(nombre);
  const partes = nombreBase(nombre)
    .split(/\s*(?:\+|&|,|;)\s*|\s+y\s+|\s+con\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length || (partes.length === 1 && !pack.unidades)) return [];
  const indice = simples.map((s) => ({ s, claves: palabrasClave(s.nombre) }));
  const elegidos: { componenteId: string; cantidad: number }[] = [];
  for (const parte of partes) {
    const claves = palabrasClave(parte).filter((p) => !PALABRAS_DE_VENTA.has(p));
    if (!claves.length) continue;
    const candidatos: { id: string; puntaje: number; comunes: number }[] = [];
    const fichas = fichaDe(parte);
    for (const { s, claves: propias } of indice) {
      if (elegidos.some((e) => e.componenteId === s.id)) continue;
      // Al menos una palabra larga en común: «crema» sola no basta para juntar dos productos distintos.
      const comunLarga = claves.some((c) => c.length >= 4 && propias.some((q) => q === c || (Math.min(c.length, q.length) >= 4 && (q.startsWith(c) || c.startsWith(q)))));
      if (!comunLarga) continue;
      const puntaje = parecidoNombre(claves, propias);
      if (puntaje < 0.5) continue;
      candidatos.push({ id: s.id, puntaje, comunes: [...fichaDe(s.nombre)].filter((t) => fichas.has(t)).length });
    }
    if (!candidatos.length) continue;
    // Entre los igual de parecidos desempatan todas las palabras en común, también los números y las cortas («Shilajit 8 EN 1» → «Shilajit en
    // Capsula (8 en 1)» y no «Shilajit Gold»). Si aun así quedan dos iguales («crema» sola), no se adivina: se busca a mano.
    const mejorPuntaje = Math.max(...candidatos.map((c) => c.puntaje));
    const finalistas = candidatos.filter((c) => c.puntaje === mejorPuntaje);
    const mejorComunes = Math.max(...finalistas.map((c) => c.comunes));
    const ganadores = finalistas.filter((c) => c.comunes === mejorComunes);
    const mejor = ganadores.length === 1 ? ganadores[0] : null;
    if (mejor) elegidos.push({ componenteId: mejor.id, cantidad: partes.length === 1 && pack.unidades ? pack.unidades : 1 });
  }
  return elegidos;
}

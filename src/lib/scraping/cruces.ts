// Cruces de Testing Lab (14 oct 2026), sin base ni React para poder probarlos:
// * `yaVisto`: si un candidato (de Scraping o de Selección) ya se testeó (Test productos) o ya está en Producto, con el
//   detalle para la nota del descarte. Compara el nombre (como el aviso de duplicado de Producto) y, si hay, la huella de la foto.
// * `repetidos`: qué productos aparecen en más de un proveedor o fuente: se está vendiendo fuerte, es prioridad.

import { distanciaHuella, palabrasClave, parecidoNombre, UMBRAL_FOTO } from "@/lib/wms/duplicados";
import { palabrasParaVincular } from "./comparar";

/**
 * Para «ya testeado» (que descarta solo): 85 % de las palabras del nombre más corto y al menos 2 en común, o la misma foto.
 * Con 75 % (el aviso de duplicado de Producto) se colaban productos distintos de la misma marca o tipo (medido con HYPER MODA,
 * 14 oct 2026: «Truly Glass Skin» con «Truly Glass Skin After Shave Oil», un espejo con luces LED con otras luces).
 */
export const UMBRAL_YA_VISTO = 0.85;
/** Para decir que es el mismo producto en otro proveedor se pide más: 85 % y 2 palabras en común, o la misma foto. */
export const UMBRAL_REPETIDO = 0.85;

export interface Referencia {
  tipo: "test" | "producto";
  id: string;
  nombre: string;
  huella: string | null;
  /** Lo que se dice en la nota: «Test #3 · 12 mar 2026 · winner» o el SKU. */
  detalle: string;
}

export interface Coincidencia {
  tipo: "test" | "producto";
  id: string;
  nombre: string;
  detalle: string;
  porFoto: boolean;
  parecido: number;
}

export interface IndiceReferencias {
  refs: (Referencia & { palabras: string[] })[];
  porPalabra: Map<string, number[]>;
}

/** Prepara las referencias una vez (sus palabras y un índice por palabra) para cruzar muchos candidatos rápido. */
export function indexar(refs: Referencia[]): IndiceReferencias {
  const conPalabras = refs.map((r) => ({ ...r, palabras: palabrasClave(r.nombre) }));
  const porPalabra = new Map<string, number[]>();
  conPalabras.forEach((r, i) => {
    for (const p of r.palabras) {
      const lista = porPalabra.get(p) ?? [];
      lista.push(i);
      porPalabra.set(p, lista);
    }
  });
  return { refs: conPalabras, porPalabra };
}

const comunes = (a: string[], b: string[], parecido: number) => Math.round(parecido * Math.min(a.length, b.length));

/** La referencia más parecida (un test se prefiere a un producto si se parecen igual), o `null`. */
export function yaVisto(nombre: string, huella: string | null, indice: IndiceReferencias): Coincidencia | null {
  const palabras = palabrasClave(nombre);
  const candidatos = new Set<number>();
  for (const p of palabras) for (const i of indice.porPalabra.get(p) ?? []) candidatos.add(i);
  // Por la foto se revisan todas (pocas tienen huella y no comparten palabras necesariamente).
  if (huella) indice.refs.forEach((r, i) => r.huella && candidatos.add(i));
  let mejor: (Coincidencia & { puntos: number }) | null = null;
  for (const i of candidatos) {
    const r = indice.refs[i];
    const parecido = parecidoNombre(palabras, r.palabras);
    const porNombre = parecido >= UMBRAL_YA_VISTO && comunes(palabras, r.palabras, parecido) >= 2;
    // La foto sola no basta: muchas fotos de Dropi se parecen (fondo blanco, plantilla del proveedor) y daban un tónico
    // facial igual a un suplemento. Cuenta si además comparten alguna palabra del nombre.
    const porFoto = !!huella && !!r.huella && parecido > 0 && distanciaHuella(huella, r.huella) <= UMBRAL_FOTO;
    if (!porNombre && !porFoto) continue;
    const puntos = (porFoto ? 2 : 0) + parecido + (r.tipo === "test" ? 0.01 : 0);
    if (!mejor || puntos > mejor.puntos) mejor = { tipo: r.tipo, id: r.id, nombre: r.nombre, detalle: r.detalle, porFoto, parecido, puntos };
  }
  if (!mejor) return null;
  const { puntos: _p, ...coincidencia } = mejor;
  void _p;
  return coincidencia;
}

/** La nota de un descarte por haberse visto antes. */
export function motivoYaVisto(c: Coincidencia): string {
  const como = c.porFoto ? "misma foto" : `${Math.round(c.parecido * 100)} % del nombre`;
  return c.tipo === "test"
    ? `Ya testeado: «${c.nombre}» en Test productos (${c.detalle}; ${como}).`
    : `Ya está en Producto: «${c.nombre}» (${c.detalle}; ${como}).`;
}

export interface ItemRepetible {
  id: string;
  /** El proveedor o la fuente de donde salió: dos ítems del mismo grupo no cuentan como repetición. */
  grupo: string;
  nombre: string;
  huella: string | null;
}

/** Para cada ítem, los otros grupos (proveedores o fuentes) donde aparece el mismo producto. Solo trae los repetidos. */
export function repetidos(items: ItemRepetible[], ignorar = ""): Map<string, Set<string>> {
  const palabras = items.map((it) => palabrasParaVincular(it.nombre, ignorar));
  const porPalabra = new Map<string, number[]>();
  palabras.forEach((ps, i) => ps.forEach((p) => porPalabra.set(p, [...(porPalabra.get(p) ?? []), i])));
  const conHuella = items.map((it, i) => (it.huella ? i : -1)).filter((i) => i >= 0);
  const salida = new Map<string, Set<string>>();
  const marcar = (i: number, j: number) => {
    const a = salida.get(items[i].id) ?? new Set<string>();
    a.add(items[j].grupo);
    salida.set(items[i].id, a);
  };
  items.forEach((it, i) => {
    const vistos = new Set<number>();
    for (const p of palabras[i]) for (const j of porPalabra.get(p) ?? []) vistos.add(j);
    if (it.huella) for (const j of conHuella) vistos.add(j);
    for (const j of vistos) {
      if (j === i || items[j].grupo === it.grupo) continue;
      const parecido = parecidoNombre(palabras[i], palabras[j]);
      const porNombre = parecido >= UMBRAL_REPETIDO && comunes(palabras[i], palabras[j], parecido) >= 2;
      const porFoto = !!it.huella && !!items[j].huella && parecido > 0 && distanciaHuella(it.huella, items[j].huella!) <= UMBRAL_FOTO;
      if (porNombre || porFoto) marcar(i, j);
    }
  });
  return salida;
}

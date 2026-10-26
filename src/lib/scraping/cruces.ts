// Cruces de Testing Lab (14 oct 2026), sin base ni React para poder probarlos:
// * `yaVisto`: si un candidato (de Scraping o de Selección) ya se testeó (Test productos), ya está en Producto, ya se compró
//   (Compras) o ya lo vendemos en Dropi (Gestión de IDs Dropi; las dos últimas desde el 26 oct 2026, pedido de Hernán: «que no
//   testeemos algo que ya tenemos o que ya compramos»), con el detalle para la nota del descarte. Compara el nombre (como el aviso
//   de duplicado de Producto) y, si hay, la huella de la foto.
// * `parecidos`: lo nuestro que se PARECE sin ser igual (60 % del nombre y 2 palabras en común, o una foto cercana): no descarta,
//   se muestra para revisarlo antes de testear.
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
/** Para «se parece a algo nuestro» (no descarta: avisa): 60 % del nombre y 2 palabras en común, o una foto algo cercana. */
export const UMBRAL_PARECIDO = 0.6;
const UMBRAL_FOTO_PARECIDA = UMBRAL_FOTO + 4;
/** Palabras que no dicen qué producto es (no alcanzan solas para «se parece»). */
const GENERICAS = new Set(["suplemento", "suplementos", "capsulas", "capsula", "crema", "aceite", "viral", "natural", "naturales", "original", "combo", "unidades", "gramos", "tabletas", "gomitas"]);

/** De dónde sale lo nuestro: Test productos, Producto, Compras o Gestión de IDs Dropi. */
export type TipoReferencia = "test" | "producto" | "compra" | "publicacion";

/** Si dos se parecen igual, cuál se nombra: lo comprado y lo publicado dicen más que la ficha de Producto. */
const PREFERENCIA: Record<TipoReferencia, number> = { compra: 0.03, publicacion: 0.02, test: 0.01, producto: 0 };

/** Cómo se dice cada uno en una insignia. */
export const ETIQUETA_REFERENCIA: Record<TipoReferencia, string> = { test: "Ya testeado", producto: "En Producto", compra: "Ya comprado", publicacion: "Lo vendemos en Dropi" };

export interface Referencia {
  tipo: TipoReferencia;
  id: string;
  nombre: string;
  huella: string | null;
  /** Lo que se dice en la nota: «Test #3 · 12 mar 2026 · winner» o el SKU. */
  detalle: string;
}

export interface Coincidencia {
  tipo: TipoReferencia;
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
    const puntos = (porFoto ? 2 : 0) + parecido + PREFERENCIA[r.tipo];
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
  if (c.tipo === "test") return `Ya testeado: «${c.nombre}» en Test productos (${c.detalle}; ${como}).`;
  if (c.tipo === "compra") return `Ya se compró: «${c.nombre}» (${c.detalle}; ${como}).`;
  if (c.tipo === "publicacion") return `Ya lo vendemos en Dropi: «${c.nombre}» (${c.detalle}; ${como}).`;
  return `Ya está en Producto: «${c.nombre}» (${c.detalle}; ${como}).`;
}

/**
 * Lo nuestro que se PARECE sin llegar a ser igual (lo igual lo da `yaVisto`): 60 % del nombre y 2 palabras en común, o una
 * foto algo cercana con alguna palabra en común. Uno por nombre (el de más peso), los más parecidos primero, hasta `max`.
 */
export function parecidos(nombre: string, huella: string | null, indice: IndiceReferencias, max = 3): Coincidencia[] {
  const palabras = palabrasClave(nombre);
  const candidatos = new Set<number>();
  for (const p of palabras) for (const i of indice.porPalabra.get(p) ?? []) candidatos.add(i);
  const salida = new Map<string, Coincidencia & { puntos: number }>();
  for (const i of candidatos) {
    const r = indice.refs[i];
    const parecido = parecidoNombre(palabras, r.palabras);
    const enComun = comunes(palabras, r.palabras, parecido);
    const distancia = huella && r.huella ? distanciaHuella(huella, r.huella) : 64;
    const igual = (parecido >= UMBRAL_YA_VISTO && enComun >= 2) || (parecido > 0 && distancia <= UMBRAL_FOTO);
    if (igual) continue;
    // Además, alguna palabra en común de 5 letras o más: «Pro Max» o «Viral» solas juntaban un dron con un suplemento.
    const fuerte = palabras.some((x) => x.length >= 5 && !GENERICAS.has(x) && r.palabras.some((y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))));
    const porNombre = parecido >= UMBRAL_PARECIDO && enComun >= 2 && fuerte;
    const porFoto = parecido > 0 && distancia <= UMBRAL_FOTO_PARECIDA;
    if (!porNombre && !porFoto) continue;
    const puntos = (porFoto ? 1 : 0) + parecido + PREFERENCIA[r.tipo];
    const clave = r.nombre.trim().toLowerCase();
    const previo = salida.get(clave);
    if (!previo || puntos > previo.puntos) salida.set(clave, { tipo: r.tipo, id: r.id, nombre: r.nombre, detalle: r.detalle, porFoto, parecido, puntos });
  }
  return [...salida.values()]
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, max)
    .map(({ puntos: _p, ...c }) => (void _p, c));
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

/**
 * Todas las referencias que son el mismo producto (no solo la mejor), de la más parecida a la menos: con las mismas reglas
 * que `yaVisto` (85 % del nombre y 2 palabras en común, o la misma foto con alguna palabra en común). La usa la competencia de
 * un producto de Producto o de una compra.
 */
export function todasLasCoincidencias(nombre: string, huella: string | null, indice: IndiceReferencias): Coincidencia[] {
  const palabras = palabrasClave(nombre);
  const candidatos = new Set<number>();
  for (const p of palabras) for (const i of indice.porPalabra.get(p) ?? []) candidatos.add(i);
  const salida: (Coincidencia & { puntos: number })[] = [];
  for (const i of candidatos) {
    const r = indice.refs[i];
    const parecido = parecidoNombre(palabras, r.palabras);
    const porNombre = parecido >= UMBRAL_YA_VISTO && comunes(palabras, r.palabras, parecido) >= 2;
    const porFoto = !!huella && !!r.huella && parecido > 0 && distanciaHuella(huella, r.huella) <= UMBRAL_FOTO;
    if (porNombre || porFoto) salida.push({ tipo: r.tipo, id: r.id, nombre: r.nombre, detalle: r.detalle, porFoto, parecido, puntos: (porFoto ? 2 : 0) + parecido });
  }
  return salida.sort((a, b) => b.puntos - a.puntos).map(({ puntos: _p, ...c }) => (void _p, c));
}

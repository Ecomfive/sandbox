// Gestión de IDs Dropi › vincular cada publicación con su producto de Producto (21 oct 2026). Sin base ni React, para
// poder probarlo. Reglas (decididas por Hernán):
// * Seguro: el SKU o el nombre del producto es idéntico al nombre de la publicación (o al del catálogo de Dropi con ese ID).
//   Esas se vinculan de una vez; las demás se sugieren y una persona las confirma.
// * Sugerido: el cruce de Testing Lab (`todasLasCoincidencias`: 85 % del nombre y 2 palabras en común, o la misma foto con alguna
//   palabra en común) da un solo producto.
// * Un pack («PACK 2», «2x1», «x2») va al **compuesto** de Producto con ese simple y esa cantidad; si no existe, «Falta el
//   compuesto» (no se vincula al simple: al vender descontaría 1 unidad en vez de 2). Un «combo» de productos distintos solo
//   busca entre los compuestos.

import { indexar, todasLasCoincidencias, type IndiceReferencias } from "@/lib/scraping/cruces";

export interface SkuParaVincular {
  id: string;
  codigo: string;
  nombre: string;
  /** simple o combo (compuesto). */
  tipo: string;
  huella: string | null;
}

export interface Componente {
  comboId: string;
  componenteId: string;
  cantidad: number;
}

export type TipoSugerencia = "seguro" | "sugerido" | "varios" | "falta_compuesto" | "ninguno";

export interface Sugerencia {
  tipo: TipoSugerencia;
  /** El producto sugerido (en «falta_compuesto», el simple del que faltaría el compuesto). */
  skuId: string | null;
  /** Cómo se encontró. */
  metodo: "codigo" | "nombre" | "foto" | "parecido" | null;
  /** 0 a 1, para el parecido del nombre. */
  parecido: number;
  /** Otras opciones posibles (en «varios», todas). */
  alternativas: string[];
  /** Unidades del pack, si la publicación es un pack. */
  pack: number | null;
}

export const ETIQUETA_SUGERENCIA: Record<TipoSugerencia, string> = {
  seguro: "Coincidencia exacta",
  sugerido: "Sugerido",
  varios: "Varios posibles",
  falta_compuesto: "Falta el compuesto",
  ninguno: "Sin candidato",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Si el nombre es de un pack, cuántas unidades trae («PACK 2», «PACK-2», «2x1», «x2», «3x2» → 3); si es un combo de productos distintos, `combo`. */
export function detectarPack(nombre: string): { unidades: number | null; combo: boolean } {
  const n = norm(nombre);
  const combo = /\bcombo\b/.test(n);
  const pack = /\bpack (\d{1,2})\b/.exec(n) ?? /\b(\d{1,2}) ?x ?\d\b/.exec(n) ?? /\bx ?(\d{1,2})\b/.exec(n) ?? /\b(\d{1,2}) ?(?:unidades|piezas|pares)\b/.exec(n);
  const unidades = pack ? Number(pack[1]) : null;
  return { unidades: unidades && unidades >= 2 && unidades <= 12 ? unidades : null, combo };
}

/** El nombre sin lo que no es del producto: el prefijo interno («P-JS »), y lo del pack («PACK 2», «2x1», «x2», «combo»). */
export function nombreBase(nombre: string): string {
  return nombre
    .replace(/^\s*P-[A-Z]{1,4}\s+/i, "")
    .replace(/\(?\s*pack\s*-?\s*\d{1,2}\s*\)?/gi, " ")
    .replace(/\b\d{1,2}\s?x\s?\d\b/gi, " ")
    .replace(/\bx\s?\d{1,2}\b/gi, " ")
    .replace(/\bcombo\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ContextoVincular {
  skus: SkuParaVincular[];
  porId: Map<string, SkuParaVincular>;
  porTexto: Map<string, string>;
  indiceSimples: IndiceReferencias;
  indiceCombos: IndiceReferencias;
  /** Compuesto de un solo simple con su cantidad: `simpleId:cantidad` → id del compuesto. */
  packDe: Map<string, string>;
}

/** Prepara los productos una vez para sugerir muchas publicaciones rápido. */
export function prepararContexto(skus: SkuParaVincular[], componentes: Componente[]): ContextoVincular {
  const porTexto = new Map<string, string>();
  for (const s of skus) for (const t of [s.codigo, s.nombre]) if (norm(t) && !porTexto.has(norm(t))) porTexto.set(norm(t), s.id);
  const ref = (s: SkuParaVincular) => ({ tipo: "producto" as const, id: s.id, nombre: s.nombre, huella: s.huella, detalle: s.codigo });
  const porCombo = new Map<string, Componente[]>();
  for (const c of componentes) porCombo.set(c.comboId, [...(porCombo.get(c.comboId) ?? []), c]);
  const packDe = new Map<string, string>();
  for (const [comboId, cs] of porCombo) if (cs.length === 1 && !packDe.has(`${cs[0].componenteId}:${cs[0].cantidad}`)) packDe.set(`${cs[0].componenteId}:${cs[0].cantidad}`, comboId);
  return {
    skus,
    porId: new Map(skus.map((s) => [s.id, s])),
    porTexto,
    indiceSimples: indexar(skus.filter((s) => s.tipo !== "combo").map(ref)),
    indiceCombos: indexar(skus.filter((s) => s.tipo === "combo").map(ref)),
    packDe,
  };
}

/**
 * La sugerencia para una publicación. `textosDropi` son otros nombres con que se la conoce (el SKU y el nombre del catálogo de
 * Dropi con su mismo ID), que cuentan para la coincidencia exacta.
 */
export function sugerirSku(publicacion: { nombre: string; huella: string | null; textosDropi?: string[] }, ctx: ContextoVincular): Sugerencia {
  const { unidades, combo } = detectarPack(publicacion.nombre);
  const vacia: Sugerencia = { tipo: "ninguno", skuId: null, metodo: null, parecido: 0, alternativas: [], pack: unidades };

  // 1. Exacta: el código o el nombre de un producto es idéntico (contando el prefijo interno y lo que diga Dropi).
  for (const t of [publicacion.nombre, nombreBase(publicacion.nombre), ...(publicacion.textosDropi ?? [])]) {
    const id = ctx.porTexto.get(norm(t));
    if (!id) continue;
    const sku = ctx.porId.get(id)!;
    // Un pack que da exacto con un simple no es seguro: el nombre base calzó, pero falta el compuesto.
    if (unidades && sku.tipo !== "combo") return conPack(id, "nombre", 1, [], unidades, ctx);
    return { ...vacia, tipo: "seguro", skuId: id, metodo: norm(t) === norm(sku.nombre) ? "nombre" : "codigo", parecido: 1 };
  }

  // 2. Parecido: un combo solo entre compuestos; lo demás entre simples (un pack después se lleva a su compuesto).
  const indice = combo ? ctx.indiceCombos : ctx.indiceSimples;
  const coincidencias = todasLasCoincidencias(combo ? publicacion.nombre : nombreBase(publicacion.nombre), publicacion.huella, indice);
  if (!coincidencias.length) return vacia;
  const [mejor, ...resto] = coincidencias;
  // Una sola, o una por foto claramente mejor que las demás (sin otra por foto).
  const unica = coincidencias.length === 1 || (mejor.porFoto && !resto.some((r) => r.porFoto));
  const metodo = mejor.porFoto ? "foto" : "parecido";
  if (!unica) return { ...vacia, tipo: "varios", alternativas: coincidencias.slice(0, 5).map((c) => c.id) };
  if (unidades && !combo) return conPack(mejor.id, metodo, mejor.parecido, resto.map((r) => r.id), unidades, ctx);
  return { ...vacia, tipo: "sugerido", skuId: mejor.id, metodo, parecido: mejor.parecido, alternativas: resto.slice(0, 4).map((r) => r.id) };
}

function conPack(simpleId: string, metodo: Sugerencia["metodo"], parecido: number, alternativas: string[], unidades: number, ctx: ContextoVincular): Sugerencia {
  const compuesto = ctx.packDe.get(`${simpleId}:${unidades}`);
  if (compuesto) return { tipo: "sugerido", skuId: compuesto, metodo, parecido, alternativas: [simpleId, ...alternativas].slice(0, 4), pack: unidades };
  return { tipo: "falta_compuesto", skuId: simpleId, metodo, parecido, alternativas: alternativas.slice(0, 4), pack: unidades };
}

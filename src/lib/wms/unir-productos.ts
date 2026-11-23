// Unir dos productos duplicados desde la ficha de Producto (28 oct 2026, pedido de Jhokser: hasta ahora se hacía a mano en el editor SQL
// con `wms_unir_productos`, migración 0121). La base hace el trabajo (pasa al producto que queda todo lo vinculado al otro y borra el
// sobrante, o se niega); aquí vive lo que decide cuál queda y cómo se le dice a la persona lo que se movió. Lógica pura, con su prueba.

import { nombreBloqueo } from "./eliminar-producto";

/** Lo que hace falta de un producto para decidir cuál de dos se queda. */
export interface ProductoParaElegir {
  id: string;
  numero: number | null;
  creado_en: string;
}

/**
 * Cuál de los dos se queda: el más viejo. Los productos que se cargaron de una vez comparten la misma fecha de creación, así que
 * desempata el N.º correlativo (el menor es el primero que existió) y, al final, el id, para que el resultado nunca dependa del orden
 * en que llegan.
 */
export function elegirConservado<T extends ProductoParaElegir>(a: T, b: T): { conservar: T; eliminar: T } {
  const tiempo = (p: T) => {
    const t = Date.parse(p.creado_en);
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const numero = (p: T) => p.numero ?? Number.POSITIVE_INFINITY;
  const primero = (x: T, y: T): boolean => {
    if (tiempo(x) !== tiempo(y)) return tiempo(x) < tiempo(y);
    if (numero(x) !== numero(y)) return numero(x) < numero(y);
    return x.id < y.id;
  };
  return primero(a, b) ? { conservar: a, eliminar: b } : { conservar: b, eliminar: a };
}

/** Un producto tal como se muestra en la pantalla de unir. */
export interface ProductoUnido {
  id: string;
  numero: number | null;
  codigo: string;
  nombre: string;
  clase: string;
  tipo: string;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
  foto: string | null;
}

/** Un producto que se puede elegir como el duplicado. */
export type CandidatoUnir = ProductoUnido;

/** El informe de unir (o de simularlo): cuál queda, cuál se va y qué pasa al que queda, dicho en palabras. */
export interface ResumenUnion {
  conservar: ProductoUnido;
  eliminar: ProductoUnido;
  lineas: string[];
  /** Con variantes (23 nov 2026): cada variante del que se va y con cuál del que queda se une (null = pasa como nueva). */
  variantes?: ParejasUnion | null;
}

/** Lo que pasa a otro producto, dicho como lo ve el equipo: [uno, varios]. Lo que no está aquí usa el nombre de `nombreBloqueo`. */
const NOMBRE_MOVIDO: Record<string, [string, string]> = {
  wms_compra_items: ["línea de compra", "líneas de compra"],
  "sku_maestro_componentes.combo_id": ["componente del combo", "componentes del combo"],
  "sku_maestro_componentes.componente_id": ["combo que lo usa", "combos que lo usan"],
  // El inventario del duplicado también pasa (migración 0260): su stock en unidades, sus movimientos, lotes y cajas.
  unidades: ["unidad de inventario", "unidades de inventario"],
  wms_movimientos: ["movimiento de inventario", "movimientos de inventario"],
  wms_cajas: ["línea de cajas", "líneas de cajas"],
};

/**
 * Lo que la base movió (o movería) al producto que queda, como frases: «1 test de Test productos», «2 líneas de compra», «la foto».
 * Lo que se llama igual se suma; de más a menos. Sin nada movido, la lista queda vacía.
 */
export function lineasUnidas(movido: Record<string, unknown> | null | undefined): string[] {
  const suma = new Map<string, { n: number; nombre: [string, string] }>();
  let foto = false;
  for (const [clave, valor] of Object.entries(movido ?? {})) {
    if (clave === "foto") {
      foto = valor === true;
      continue;
    }
    const n = Number(valor);
    if (!(n > 0)) continue;
    const nombre = NOMBRE_MOVIDO[clave] ?? NOMBRE_MOVIDO[clave.split(".")[0]] ?? nombreBloqueo(clave);
    const antes = suma.get(nombre[0]);
    suma.set(nombre[0], { n: (antes?.n ?? 0) + n, nombre });
  }
  const lineas = [...suma.values()].sort((a, b) => b.n - a.n).map(({ n, nombre }) => `${n} ${n === 1 ? nombre[0] : nombre[1]}`);
  if (foto) lineas.push("la foto del producto");
  return lineas;
}

/**
 * El motivo que la base da cuando se niega a unir («No se unen X y Y: …») viene escrito para el equipo y se muestra tal cual; cualquier
 * otro error de la base no se enseña.
 */
export function mensajeErrorUnir(mensaje: string | null | undefined): string {
  const m = (mensaje ?? "").trim();
  return /^(No se unen|Elige dos productos|El producto que se)/.test(m) ? m : "No se pudieron unir los productos.";
}

/** Una variante en la pantalla de unir. */
export interface VarianteUnion {
  id: string;
  codigo: string;
  nombre: string;
}

/**
 * Las variantes de los dos productos al unir (23 nov 2026, migración 0355): las del que queda y las del que se va, cada una con su pareja (la variante del
 * que queda con la que se une) o null (pasa al que queda como variante nueva).
 */
export interface ParejasUnion {
  queda: VarianteUnion[];
  va: (VarianteUnion & { pareja: string | null })[];
}

/**
 * La clave con que se reconoce una variante entre dos productos: lo que su código agrega al del producto («LENTES/SMART/150» → «150»), sin espacios
 * ni «+». Una graduación se lee como número con dos decimales, escrita de cualquier forma: «150», «1.50», «+1.5» y «1,50» son la misma (+1.50); un
 * número entero de 50 o más sin punto es la forma vieja de escribirla (150 = 1.50, ver la nota de los lentes TR90).
 */
export function claveVariante(codigoVariante: string, codigoPadre: string): string {
  const c = String(codigoVariante ?? "").trim().toUpperCase();
  const p = String(codigoPadre ?? "").trim().toUpperCase();
  const resto = (c.startsWith(`${p}/`) ? c.slice(p.length + 1) : (c.split("/").pop() ?? c)).replace(/[\s+]/g, "").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(resto)) {
    let n = Number(resto);
    if (!resto.includes(".") && n >= 50) n = n / 100;
    return `G:${n.toFixed(2)}`;
  }
  return resto.replace(/[^A-Z0-9.]/g, "");
}

/** La pareja que se propone para cada variante del que se va: la del que queda con la misma clave (`claveVariante`), o null si no hay. */
export function emparejarVariantes(queda: VarianteUnion[], codigoQueda: string, va: VarianteUnion[], codigoVa: string): Record<string, string | null> {
  const porClave = new Map<string, string>();
  for (const v of queda) {
    const k = claveVariante(v.codigo, codigoQueda);
    if (k && !porClave.has(k)) porClave.set(k, v.id);
  }
  const usadas = new Set<string>();
  const pares: Record<string, string | null> = {};
  for (const v of va) {
    const destino = porClave.get(claveVariante(v.codigo, codigoVa)) ?? null;
    // Dos variantes del que se va no se unen con la misma del que queda: la segunda pasa como variante nueva.
    pares[v.id] = destino && !usadas.has(destino) ? destino : null;
    if (destino) usadas.add(destino);
  }
  return pares;
}

/** El informe de la base al unir con variantes (`wms_unir_productos_variantes`): lo del producto y lo de cada variante. */
export interface InformeUnion {
  movido?: Record<string, unknown> | null;
  variantes?: { variante: string; pasa?: boolean; movido?: Record<string, unknown> | null }[] | null;
}

/** Lo que pasa al que queda, sumando lo del producto y lo de sus variantes, más cuántas variantes se unen y cuántas pasan como nuevas. */
export function lineasDeInforme(informe: InformeUnion): string[] {
  const total: Record<string, unknown> = {};
  const sumar = (m: Record<string, unknown> | null | undefined) => {
    for (const [k, v] of Object.entries(m ?? {})) {
      if (k === "foto") total.foto = total.foto === true || v === true;
      else total[k] = (Number(total[k]) || 0) + (Number(v) || 0);
    }
  };
  sumar(informe.movido);
  for (const v of informe.variantes ?? []) sumar(v.movido);
  const lineas = lineasUnidas(total);
  const unidas = (informe.variantes ?? []).filter((v) => !v.pasa).length;
  const pasan = (informe.variantes ?? []).filter((v) => v.pasa).length;
  if (pasan) lineas.unshift(`${pasan} ${pasan === 1 ? "variante pasa como variante nueva" : "variantes pasan como variantes nuevas"}`);
  if (unidas) lineas.unshift(`${unidas} ${unidas === 1 ? "variante se une con su pareja" : "variantes se unen con su pareja"}`);
  return lineas;
}

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
}

/** Lo que pasa a otro producto, dicho como lo ve el equipo: [uno, varios]. Lo que no está aquí usa el nombre de `nombreBloqueo`. */
const NOMBRE_MOVIDO: Record<string, [string, string]> = {
  wms_compra_items: ["línea de compra", "líneas de compra"],
  "sku_maestro_componentes.combo_id": ["componente del combo", "componentes del combo"],
  "sku_maestro_componentes.componente_id": ["combo que lo usa", "combos que lo usan"],
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

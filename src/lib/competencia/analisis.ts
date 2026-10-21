// Análisis de competencia (14 oct 2026), sin base ni React para poder probarlo:
// * `normalizarCompetencia`: un producto del catálogo de Dropi con su proveedor.
// * `armarAlertas`: de lo que cambió en una búsqueda, lo que pide atención (bajó precio, vende más barato que nosotros, bajó
//   stock, competidor nuevo, desapareció uno igual al nuestro).
// * `unidadesBajadas`: cuántas unidades bajó el stock en los últimos N días (la señal de cuánto vende un competidor).
// Los productos iguales a los nuestros se emparejan con `yaVisto` (src/lib/scraping/cruces.ts): 85 % del nombre y 2 palabras en
// común, o la misma foto con alguna palabra en común.

import { normalizarDropi, type Evento, type ProductoVisto } from "@/lib/scraping/comparar";
import type { Coincidencia } from "@/lib/scraping/cruces";

/** Nuestro proveedor en Dropi: lo que vende se compara con todo lo demás. */
export const NUESTRO_PROVEEDOR = /^ecomfive$/i;

export interface VistoCompetencia extends ProductoVisto {
  proveedorId: number;
  proveedorNombre: string;
  esNuestro: boolean;
}

export function normalizarCompetencia(o: unknown): VistoCompetencia | null {
  const v = normalizarDropi(o);
  const u = (o as { user?: { id?: unknown; name?: unknown } } | null)?.user;
  const proveedorId = Number(u?.id);
  const proveedorNombre = typeof u?.name === "string" ? u.name.trim() : "";
  if (!v || !Number.isFinite(proveedorId) || !proveedorNombre) return null;
  return { ...v, proveedorId, proveedorNombre, esNuestro: NUESTRO_PROVEEDOR.test(proveedorNombre) };
}

export type TipoAlerta = "bajo_precio" | "mas_barato" | "bajo_stock" | "competidor_nuevo" | "desaparecio";

export interface Alerta {
  tipo: TipoAlerta;
  productoId: string | null;
  nuestroId: string | null;
  titulo: string;
  detalle: string | null;
}

export interface ProductoAlerta {
  id: string;
  nombre: string;
  proveedorNombre: string;
  esNuestro: boolean;
  precio: number | null;
  stock: number | null;
  /** El nuestro al que es igual (solo en uno de la competencia). */
  igualA: string | null;
}

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const unidades = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));

/**
 * Las alertas de una búsqueda. `cambios` son los eventos de cada producto que siguió (precio, stock, reapareció);
 * `desaparecidos` los ids; `proveedoresNuevos` los proveedores que no se habían visto. La primera búsqueda de un país no deja alertas (todo es nuevo).
 */
export function armarAlertas(datos: {
  productos: Map<string, ProductoAlerta>;
  cambios: { id: string; eventos: Evento[] }[];
  desaparecidos: string[];
  proveedoresNuevos: { nombre: string; productos: number }[];
}): Alerta[] {
  const { productos } = datos;
  const alertas: Alerta[] = [];
  const nuestro = (p: ProductoAlerta) => (p.igualA ? productos.get(p.igualA) ?? null : null);

  for (const c of datos.cambios) {
    const p = productos.get(c.id);
    if (!p || p.esNuestro) continue;
    const n = nuestro(p);
    if (!n) continue;
    for (const e of c.eventos) {
      if (e.evento === "precio" && e.precio !== null && e.precio_antes !== null && e.precio < e.precio_antes) {
        const masBarato = n.precio !== null && e.precio < n.precio;
        alertas.push({
          tipo: masBarato ? "mas_barato" : "bajo_precio",
          productoId: p.id,
          nuestroId: n.id,
          titulo: `${p.proveedorNombre} bajó el precio de «${p.nombre}»`,
          detalle: `${usd(e.precio_antes)} → ${usd(e.precio)} · el nuestro («${n.nombre}») está en ${usd(n.precio)}${masBarato ? " · ahora vende más barato que nosotros" : ""}`,
        });
      }
      if (e.evento === "stock" && e.stock !== null && e.stock_antes !== null && e.stock < e.stock_antes) {
        alertas.push({
          tipo: "bajo_stock",
          productoId: p.id,
          nuestroId: n.id,
          titulo: `${p.proveedorNombre} bajó el stock de «${p.nombre}»`,
          detalle: `${unidades(e.stock_antes)} → ${unidades(e.stock)} (−${unidades(e.stock_antes - e.stock)}) · igual a nuestro «${n.nombre}»`,
        });
      }
    }
  }

  for (const id of datos.desaparecidos) {
    const p = productos.get(id);
    if (!p || p.esNuestro) continue;
    const n = nuestro(p);
    if (!n) continue;
    alertas.push({
      tipo: "desaparecio",
      productoId: p.id,
      nuestroId: n.id,
      titulo: `${p.proveedorNombre} dejó de mostrar «${p.nombre}»`,
      detalle: `Tenía ${unidades(p.stock)} en stock · igual a nuestro «${n.nombre}» · se agotó o lo hizo privado`,
    });
  }

  for (const prov of datos.proveedoresNuevos) {
    alertas.push({ tipo: "competidor_nuevo", productoId: null, nuestroId: null, titulo: `Competidor nuevo: ${prov.nombre}`, detalle: `${prov.productos} productos publicados` });
  }
  return alertas;
}

/** Un cambio de stock del historial (de `stockAntes` a `stock`, en `fecha`). */
export interface CambioStock {
  fecha: string;
  stock: number;
  stockAntes: number;
}

/**
 * Cuántas unidades **bajó** el stock en los últimos `dias` (solo las bajadas: una reposición no resta lo que se vendió). Es la
 * mejor señal de cuánto vende un competidor, porque Dropi no muestra sus ventas.
 */
export function unidadesBajadas(cambios: CambioStock[], dias: number, ahora = new Date()): number {
  const limite = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  return cambios.reduce((t, c) => (c.fecha > limite && c.stock < c.stockAntes ? t + (c.stockAntes - c.stock) : t), 0);
}

// ---------- Posición en precio y «Qué hacer hoy» (14 oct 2026, ideas tomadas de SmartFlow) ----------

export type EstadoPosicion = "ganando" | "empatado" | "perdiendo";

export interface Posicion {
  /** Nuestro puesto por precio (1 = el más barato) entre nosotros y la competencia. */
  pos: number;
  de: number;
  estado: EstadoPosicion;
  /** El precio más bajo de la competencia. */
  minimo: number;
}

/** Dónde quedamos en precio frente a los iguales de la competencia. `null` sin nuestro precio o sin competidores con precio. */
export function posicionPrecio(nuestro: number | null, competencia: (number | null)[]): Posicion | null {
  const precios = competencia.filter((p): p is number => p !== null);
  if (nuestro === null || !precios.length) return null;
  const minimo = Math.min(...precios);
  const masBaratos = precios.filter((p) => p < nuestro - 0.004).length;
  const iguales = precios.filter((p) => Math.abs(p - nuestro) <= 0.004).length;
  const estado: EstadoPosicion = masBaratos ? "perdiendo" : iguales ? "empatado" : "ganando";
  return { pos: masBaratos + 1, de: precios.length + 1, estado, minimo };
}

export type TipoDecision = "bajar" | "oportunidad" | "vigilar" | "mantener";

export interface Decision {
  tipo: TipoDecision;
  /** De qué producto o competidor se trata. */
  titulo: string;
  /** El motivo, con los números. */
  motivo: string;
  /** El competidor que abre al tocarla. */
  proveedorId: number;
  foto: string | null;
}

/** Lo mínimo de un producto de la competencia para decidir. */
export interface ProductoDecision {
  id: string;
  proveedorId: number;
  proveedor: string;
  nombre: string;
  foto: string | null;
  precio: number | null;
  stock: number | null;
  bajo7: number;
  estado: "activo" | "desaparecido";
  igualA: string | null;
  primeraVez: string;
  ultimaVez: string;
}

/** Al ritmo de lo vendido en 7 días, con menos de estas semanas de stock es una oportunidad. */
export const SEMANAS_OPORTUNIDAD = 6;

const usdD = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const unD = (n: number) => n.toLocaleString("es-PA");

/**
 * «Qué hacer hoy»: decisiones por producto nuestro o competidor, en este orden de importancia:
 * * **Bajar precio:** vamos perdiendo en precio y un competidor más barato vendió algo en 7 días.
 * * **Oportunidad de stock:** un competidor con un producto igual al nuestro tiene stock para menos de 6 semanas al ritmo de
 *   los últimos 7 días, o lo dejó de mostrar en la última semana.
 * * **Vigilar:** un competidor nuevo o uno que empezó a vender un producto igual al nuestro en la última semana (después de la
 *   primera búsqueda, `corte`).
 * * **Mantener precio:** vamos ganando y la competencia sigue vendiendo.
 */
export function decisionesDeHoy(
  nuestros: { id: string; nombre: string; precio: number | null; foto: string | null }[],
  competencia: ProductoDecision[],
  competidoresNuevos: { proveedorId: number; nombre: string; productos: number }[],
  corte: string | null,
  ahora = new Date(),
): Decision[] {
  const hace7 = new Date(ahora.getTime() - 7 * 86_400_000).toISOString();
  const igualesDe = new Map<string, ProductoDecision[]>();
  for (const p of competencia) if (p.igualA) igualesDe.set(p.igualA, [...(igualesDe.get(p.igualA) ?? []), p]);
  const salida: Decision[] = [];

  for (const n of nuestros) {
    const todos = igualesDe.get(n.id) ?? [];
    const activos = todos.filter((p) => p.estado === "activo");
    // El precio del competidor se lleva al tamaño del nuestro (cápsulas, ml, g o unidades de un PACK/COMBO).
    const nuestroU = n.precio;
    const unidad = (p: ProductoDecision) => precioEquivalente(n.nombre, p).precio;
    const suPrecio = (p: ProductoDecision) => {
      const e = precioEquivalente(n.nombre, p);
      return e.nota ? `${e.nota} (= ${usdD(e.precio)} por el nuestro)` : usdD(e.precio);
    };
    const pos = posicionPrecio(nuestroU, activos.map(unidad));
    const vendido = activos.reduce((t, p) => t + p.bajo7, 0);

    if (pos?.estado === "perdiendo" && nuestroU !== null) {
      const baratoQueVende = activos
        .filter((p) => (unidad(p) ?? Infinity) < nuestroU - 0.004 && p.bajo7 > 0)
        .sort((a, b) => (unidad(a) ?? 0) - (unidad(b) ?? 0))[0];
      if (baratoQueVende)
        salida.push({
          tipo: "bajar",
          titulo: n.nombre,
          motivo: `${baratoQueVende.proveedor} lo vende a ${suPrecio(baratoQueVende)}, nosotros ${usdD(nuestroU)}, y vendió ${unD(baratoQueVende.bajo7)} en 7 días. Somos #${pos.pos} de ${pos.de}.`,
          proveedorId: baratoQueVende.proveedorId,
          foto: n.foto ?? baratoQueVende.foto,
        });
    }

    for (const p of todos) {
      if (p.estado === "desaparecido") {
        if (p.ultimaVez > hace7)
          salida.push({ tipo: "oportunidad", titulo: n.nombre, motivo: `${p.proveedor} dejó de mostrar «${p.nombre}» (tenía ${unD(p.stock ?? 0)} en stock): se agotó o lo hizo privado.`, proveedorId: p.proveedorId, foto: n.foto ?? p.foto });
        continue;
      }
      if (p.bajo7 <= 0 || p.stock === null) continue;
      const semanas = p.stock / p.bajo7;
      if (semanas < SEMANAS_OPORTUNIDAD) {
        const s = Math.max(1, Math.round(semanas));
        salida.push({
          tipo: "oportunidad",
          titulo: n.nombre,
          motivo: `A ${p.proveedor} le quedan ${unD(p.stock)} y vende ${unD(p.bajo7)} por semana: se queda sin stock en ~${s} semana${s === 1 ? "" : "s"}.`,
          proveedorId: p.proveedorId,
          foto: n.foto ?? p.foto,
        });
      }
    }

    if (corte)
      for (const p of activos)
        if (p.primeraVez > corte && p.primeraVez > hace7)
          salida.push({ tipo: "vigilar", titulo: n.nombre, motivo: `${p.proveedor} empezó a venderlo a ${suPrecio(p)}; nosotros ${usdD(nuestroU)}.`, proveedorId: p.proveedorId, foto: n.foto ?? p.foto });

    if (pos?.estado === "ganando" && vendido > 0 && nuestroU !== null)
      salida.push({
        tipo: "mantener",
        titulo: n.nombre,
        motivo: `Somos los más baratos (${usdD(nuestroU)} frente a ${suPrecio(activos.find((p) => unidad(p) === pos.minimo) ?? activos[0])}) y la competencia vendió ${unD(vendido)} en 7 días: no hace falta bajar.`,
        proveedorId: activos.find((p) => unidad(p) === pos.minimo)?.proveedorId ?? activos[0].proveedorId,
        foto: n.foto,
      });
  }

  for (const c of competidoresNuevos)
    salida.push({ tipo: "vigilar", titulo: `${c.nombre} (competidor nuevo)`, motivo: `Entró a Dropi con ${unD(c.productos)} productos.`, proveedorId: c.proveedorId, foto: null });

  const orden: Record<TipoDecision, number> = { bajar: 0, oportunidad: 1, vigilar: 2, mantener: 3 };
  return salida.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

// ---------- Unidades por nombre: comparar precio por unidad ----------

/** Hasta cuántas unidades se acepta leer del nombre (más que eso suele ser el contenido: «x 60 cápsulas»). */
const MAX_UNIDADES = 6;
/** Lo que sigue a un número cuando es contenido y no cantidad de productos. */
const CONTENIDO = /^\s*(caps?|c[aá]psulas?|ml|g|gr|gramos?|mg|oz|kg|l|lt|litros?|tabletas?|gomitas?|sobres?|piezas?|pzs?|cm|mm)\b/i;

/**
 * Cuántas unidades del producto trae una publicación, leído del nombre: «PACK-2», «Pack 3», «2x1», «X2», «2 Pares», «3
 * unidades», o un «COMBO A y B» (cuenta las partes). Sin nada de eso, 1. No confunde el contenido («x 60 cápsulas», «120
 * capsulas», «Kit 6 piezas») con unidades.
 */
export function unidadesEnNombre(nombre: string): number {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const acotar = (x: number) => (Number.isFinite(x) && x >= 2 && x <= MAX_UNIDADES ? x : null);
  const pack = /\bpack\s*[-x]?\s*(\d+)\b/.exec(n);
  if (pack && acotar(Number(pack[1]))) return Number(pack[1]);
  const porUno = /\b(\d+)\s*x\s*1\b/.exec(n);
  if (porUno && acotar(Number(porUno[1]))) return Number(porUno[1]);
  const pares = /\b(\d+)\s*(pares|unidades|unid|und|uds)\b/.exec(n);
  if (pares && acotar(Number(pares[1]))) return Number(pares[1]);
  for (const m of n.matchAll(/(?:^|[\s(])x\s*(\d+)\b/g)) {
    const resto = n.slice((m.index ?? 0) + m[0].length);
    if (!CONTENIDO.test(resto) && acotar(Number(m[1]))) return Number(m[1]);
  }
  if (/\bcombo\b/.test(n)) {
    const partes = n.replace(/^.*\bcombo\b/, "").split(/\s+(?:y|\+|&)\s+|\s*\+\s*/).filter((p) => p.trim().length > 1);
    if (acotar(partes.length)) return partes.length;
  }
  return 1;
}

/** El precio de una unidad (el de la publicación entre las unidades que trae). */
export function precioPorUnidad(precio: number | null, nombre: string): number | null {
  return precio === null ? null : Math.round((precio / unidadesEnNombre(nombre)) * 100) / 100;
}

// ---------- Contenido (cápsulas, ml, g) y precio equivalente a nuestro producto ----------

export type TipoMedida = "cápsulas" | "ml" | "g";

/** El contenido de una unidad, leído del nombre: «120 capsulas», «90 CAP», «150 CAPS», «30ML», «20G». `null` si no dice. */
export function medidaEnNombre(nombre: string): { tipo: TipoMedida; cantidad: number } | null {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const caps = /(\d+)\s*(capsulas?|caps?|cps|softgels?|tabletas?|tabs|gomitas?|gummies)\b/.exec(n);
  if (caps && Number(caps[1]) >= 5) return { tipo: "cápsulas", cantidad: Number(caps[1]) };
  const ml = /(\d+(?:[.,]\d+)?)\s*ml\b/.exec(n);
  if (ml) return { tipo: "ml", cantidad: Number(ml[1].replace(",", ".")) };
  const g = /(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)\b/.exec(n);
  if (g) return { tipo: "g", cantidad: Number(g[1].replace(",", ".")) };
  return null;
}

/**
 * El precio de otra publicación llevado al tamaño de la nuestra, para comparar peras con peras:
 * * si las dos dicen su contenido del mismo tipo (cápsulas, ml o g), por contenido: 60 cápsulas a $6.00 equivalen a $12.00
 *   por nuestras 120;
 * * si no, por unidades: un PACK-2 nuestro frente a la unidad de otro compara contra el doble de su precio.
 * `nota` explica la conversión («$6.00 por 60 cápsulas») y es `null` si no hizo falta convertir.
 */
export function precioEquivalente(nuestroNombre: string, otro: { precio: number | null; nombre: string }): { precio: number | null; nota: string | null } {
  if (otro.precio === null) return { precio: null, nota: null };
  const un = unidadesEnNombre(nuestroNombre);
  const uo = unidadesEnNombre(otro.nombre);
  const mn = medidaEnNombre(nuestroNombre);
  const mo = medidaEnNombre(otro.nombre);
  const redondo = (x: number) => Math.round(x * 100) / 100;
  if (mn && mo && mn.tipo === mo.tipo) {
    const totalN = un * mn.cantidad;
    const totalO = uo * mo.cantidad;
    if (totalN === totalO) return { precio: otro.precio, nota: null };
    return { precio: redondo((otro.precio / totalO) * totalN), nota: `$${otro.precio.toFixed(2)} por ${totalO.toLocaleString("es-PA")} ${mo.tipo}` };
  }
  if (un === uo) return { precio: otro.precio, nota: null };
  return { precio: redondo((otro.precio / uo) * un), nota: `$${otro.precio.toFixed(2)} por ${uo} unidad${uo === 1 ? "" : "es"}` };
}

/**
 * Junta las coincidencias de varias búsquedas (el nombre del producto y el nombre con que está en Dropi): un mismo producto de la
 * competencia cuenta una vez, con el mayor parecido y «por foto» si alguna búsqueda lo encontró por la foto. Las más parecidas primero.
 */
export function unirCoincidencias(listas: Coincidencia[][]): Coincidencia[] {
  const porId = new Map<string, Coincidencia>();
  for (const c of listas.flat()) {
    const antes = porId.get(c.id);
    porId.set(c.id, antes ? { ...antes, parecido: Math.max(antes.parecido, c.parecido), porFoto: antes.porFoto || c.porFoto } : c);
  }
  return [...porId.values()].sort((a, b) => (Number(b.porFoto) + b.parecido) - (Number(a.porFoto) + a.parecido));
}

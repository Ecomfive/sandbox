// Análisis de competencia (14 oct 2026), sin base ni React para poder probarlo:
// * `normalizarCompetencia`: un producto del catálogo de Dropi con su proveedor.
// * `armarAlertas`: de lo que cambió en una búsqueda, lo que pide atención (bajó precio, vende más barato que nosotros, bajó
//   stock, competidor nuevo, desapareció uno igual al nuestro).
// * `unidadesBajadas`: cuántas unidades bajó el stock en los últimos N días (la señal de cuánto vende un competidor).
// Los productos iguales a los nuestros se emparejan con `yaVisto` (src/lib/scraping/cruces.ts): 85 % del nombre y 2 palabras en
// común, o la misma foto con alguna palabra en común.

import { normalizarDropi, type Evento, type ProductoVisto } from "@/lib/scraping/comparar";

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
    const pos = posicionPrecio(n.precio, activos.map((p) => p.precio));
    const vendido = activos.reduce((t, p) => t + p.bajo7, 0);

    if (pos?.estado === "perdiendo" && n.precio !== null) {
      const precio = n.precio;
      const baratoQueVende = activos.filter((p) => p.precio !== null && p.precio < precio - 0.004 && p.bajo7 > 0).sort((a, b) => (a.precio ?? 0) - (b.precio ?? 0))[0];
      if (baratoQueVende)
        salida.push({
          tipo: "bajar",
          titulo: n.nombre,
          motivo: `${baratoQueVende.proveedor} lo vende a ${usdD(baratoQueVende.precio)} (nosotros ${usdD(precio)}) y vendió ${unD(baratoQueVende.bajo7)} en 7 días. Somos #${pos.pos} de ${pos.de}.`,
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
          salida.push({ tipo: "vigilar", titulo: n.nombre, motivo: `${p.proveedor} empezó a venderlo a ${usdD(p.precio)} (nosotros ${usdD(n.precio)}).`, proveedorId: p.proveedorId, foto: n.foto ?? p.foto });

    if (pos?.estado === "ganando" && vendido > 0 && n.precio !== null)
      salida.push({
        tipo: "mantener",
        titulo: n.nombre,
        motivo: `Somos los más baratos (${usdD(n.precio)} frente a ${usdD(pos.minimo)}) y la competencia vendió ${unD(vendido)} en 7 días: no hace falta bajar.`,
        proveedorId: activos.find((p) => p.precio === pos.minimo)?.proveedorId ?? activos[0].proveedorId,
        foto: n.foto,
      });
  }

  for (const c of competidoresNuevos)
    salida.push({ tipo: "vigilar", titulo: `${c.nombre} (competidor nuevo)`, motivo: `Entró a Dropi con ${unD(c.productos)} productos.`, proveedorId: c.proveedorId, foto: null });

  const orden: Record<TipoDecision, number> = { bajar: 0, oportunidad: 1, vigilar: 2, mantener: 3 };
  return salida.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

// Análisis de competencia (14 oct 2026), sin base ni React para poder probarlo:
// * `normalizarCompetencia`: un producto del catálogo de Dropi con su proveedor.
// * `armarAlertas`: de lo que cambió en una búsqueda, lo que pide atención (bajó precio, vende más barato que nosotros, bajó
//   stock, nuevo que no tenemos, competidor nuevo, desapareció uno igual al nuestro).
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

export type TipoAlerta = "bajo_precio" | "mas_barato" | "bajo_stock" | "nuevo" | "competidor_nuevo" | "desaparecio";

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
 * `nuevos` y `desaparecidos` los ids; `yaLoTenemos` dice si un nuevo sin pareja ya está en Producto o en Test productos;
 * `proveedoresNuevos` los proveedores que no se habían visto. La primera búsqueda de un país no deja alertas (todo es nuevo).
 */
export function armarAlertas(datos: {
  productos: Map<string, ProductoAlerta>;
  cambios: { id: string; eventos: Evento[] }[];
  nuevos: string[];
  desaparecidos: string[];
  yaLoTenemos: (id: string) => string | null;
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

  for (const id of datos.nuevos) {
    const p = productos.get(id);
    if (!p || p.esNuestro || p.igualA) continue;
    const tenemos = datos.yaLoTenemos(id);
    if (tenemos) continue;
    alertas.push({
      tipo: "nuevo",
      productoId: p.id,
      nuestroId: null,
      titulo: `Nuevo en ${p.proveedorNombre}: «${p.nombre}»`,
      detalle: `${usd(p.precio)} · ${unidades(p.stock)} en stock · no lo tenemos`,
    });
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
